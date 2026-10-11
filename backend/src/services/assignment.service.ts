import type { Tx } from '../lib/prisma';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, badTransition } from '../lib/errors';
import { env, normalizedAssignmentWeights } from '../config/env';
import { haversineDistanceKm, pincodeCentroid, round, type Coordinates } from '../utils/geo';
import { assertTransition } from '../utils/statusMachine';
import { recordHistory, recordHistoryForItems } from './history.service';

/**
 * =====================================================================================
 *  Rule-based pickup assignment engine
 * =====================================================================================
 *  This is a DETERMINISTIC, rules-and-weights algorithm. It contains no machine learning,
 *  no statistical inference and no external service: given the same database state and the
 *  same configuration it always produces the same assignment. See
 *  docs/ASSIGNMENT_ALGORITHM.md for the full specification and worked examples.
 *
 *  Two stages:
 *    1. ELIGIBILITY  — hard filters. A candidate that fails any filter is never assigned,
 *                      regardless of how good its score is.
 *    2. SCORING      — a weighted sum of four normalised factors in [0, 1], where higher
 *                      is better. Weights come from the environment and are normalised to
 *                      sum to 1, so operators can re-tune priorities without a code change.
 *
 *      score = w_distance   * distanceScore
 *            + w_workload   * workloadScore
 *            + w_availability * reliabilityScore
 *            + w_capacity   * capacityScore
 *
 *  Real-world factors deliberately NOT included (and why) are listed in the docs — e.g.
 *  live traffic, fuel cost and time-of-day routing all require paid third-party data.
 * =====================================================================================
 */

/** Neutral value used for the reliability factor when an agent has no rating history. */
export const NEUTRAL_RELIABILITY_SCORE = 0.7;

/** Score used when a pickup and an agent are in the same city but no coordinates exist. */
export const SAME_CITY_DISTANCE_SCORE = 0.6;

/** Neutral distance score when nothing at all is known about either location. */
export const UNKNOWN_DISTANCE_SCORE = 0.5;

export type DistanceSource = 'COORDINATES' | 'PINCODE_CENTROID' | 'CITY' | 'UNKNOWN';

export interface AgentCandidate {
  agentProfileId: number;
  userId: number;
  fullName: string;
  centerId: number | null;
  centerCity: string | null;
  centerCoordinates: Coordinates | null;
  userCity: string | null;
  userCoordinates: Coordinates | null;
  isAvailable: boolean;
  isVerified: boolean;
  currentLoadCount: number;
  maxDailyPickups: number;
  vehicleCapacityKg: number;
  ratingAvg: number;
}

export interface AssignmentContext {
  pickupRequestId: number;
  requestCity: string;
  requestPincode: string;
  requestCoordinates: Coordinates | null;
  requestCenterId: number | null;
  estimatedWeightKg: number | null;
}

export interface ScoredCandidate {
  agentProfileId: number;
  userId: number;
  fullName: string;
  eligible: boolean;
  /** Human-readable reasons the candidate was excluded (empty when eligible). */
  exclusionReasons: string[];
  distanceKm: number | null;
  distanceSource: DistanceSource;
  components: {
    distance: number;
    workload: number;
    reliability: number;
    capacity: number;
  };
  /** Weighted total in [0, 1]. Only meaningful for eligible candidates. */
  totalScore: number;
  /** Convenience fields for the UI and the audit log. */
  currentLoadCount: number;
  maxDailyPickups: number;
  utilizationPct: number;
  ratingAvg: number;
  vehicleCapacityKg: number;
}

export interface AssignmentConfig {
  maxDistanceKm: number;
  weights: { distance: number; workload: number; availability: number; capacity: number };
  neutralReliability?: number;
}

export function currentAssignmentConfig(): AssignmentConfig {
  return {
    maxDistanceKm: env.ASSIGN_MAX_DISTANCE_KM,
    weights: normalizedAssignmentWeights(),
    neutralReliability: NEUTRAL_RELIABILITY_SCORE,
  };
}

/** Resolves the best available location for the pickup origin. */
export function resolveRequestLocation(ctx: AssignmentContext): {
  coordinates: Coordinates | null;
  source: DistanceSource;
} {
  if (ctx.requestCoordinates) return { coordinates: ctx.requestCoordinates, source: 'COORDINATES' };
  const fromPincode = pincodeCentroid(ctx.requestPincode);
  if (fromPincode) return { coordinates: fromPincode, source: 'PINCODE_CENTROID' };
  return { coordinates: null, source: 'UNKNOWN' };
}

function candidateCoordinates(candidate: AgentCandidate): Coordinates | null {
  return candidate.userCoordinates ?? candidate.centerCoordinates ?? null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Stage 1 + 2 for a single candidate. Exported (and pure) so the test suite can assert the
 * exact rules without touching the database.
 */
export function scoreCandidate(
  ctx: AssignmentContext,
  candidate: AgentCandidate,
  config: AssignmentConfig,
  peerMaxCapacityKg: number,
): ScoredCandidate {
  const exclusionReasons: string[] = [];
  const location = resolveRequestLocation(ctx);
  const coords = candidateCoordinates(candidate);

  // ---- Stage 1: hard eligibility filters ---------------------------------------------
  if (!candidate.isVerified) exclusionReasons.push('Agent profile is not verified for assignments');

  if (!candidate.isAvailable) exclusionReasons.push('Agent is currently marked unavailable');

  if (candidate.currentLoadCount >= candidate.maxDailyPickups) {
    exclusionReasons.push(
      `Agent is at capacity (${candidate.currentLoadCount}/${candidate.maxDailyPickups} open pickups)`,
    );
  }

  if (
    ctx.requestCenterId !== null &&
    candidate.centerId !== null &&
    candidate.centerId !== ctx.requestCenterId
  ) {
    exclusionReasons.push('Agent belongs to a different collection centre than the request');
  }

  if (ctx.estimatedWeightKg !== null && candidate.vehicleCapacityKg < ctx.estimatedWeightKg) {
    exclusionReasons.push(
      `Vehicle capacity ${round(candidate.vehicleCapacityKg, 2)} kg is below the estimated load ${round(ctx.estimatedWeightKg, 2)} kg`,
    );
  }

  // ---- Distance ----------------------------------------------------------------------
  let distanceKm: number | null = null;
  let distanceSource: DistanceSource = 'UNKNOWN';
  let distanceScore = UNKNOWN_DISTANCE_SCORE;

  const rawDistance =
    location.coordinates && coords ? haversineDistanceKm(location.coordinates, coords) : null;

  if (rawDistance !== null) {
    distanceKm = round(rawDistance, 2);
    distanceSource = location.source;
    distanceScore = clamp01(1 - rawDistance / config.maxDistanceKm);
    if (rawDistance > config.maxDistanceKm) {
      exclusionReasons.push(
        `Distance ${round(rawDistance, 2)} km exceeds the ${config.maxDistanceKm} km service radius`,
      );
    }
  } else {
    const sameCity =
      !!candidate.centerCity &&
      !!ctx.requestCity &&
      candidate.centerCity.trim().toLowerCase() === ctx.requestCity.trim().toLowerCase();

    if (sameCity) {
      distanceSource = 'CITY';
      distanceScore = SAME_CITY_DISTANCE_SCORE;
    } else {
      distanceSource = 'UNKNOWN';
      distanceScore = UNKNOWN_DISTANCE_SCORE;
    }
  }

  // ---- Workload ----------------------------------------------------------------------
  const workloadScore = clamp01(
    candidate.maxDailyPickups > 0 ? 1 - candidate.currentLoadCount / candidate.maxDailyPickups : 0,
  );

  // ---- Reliability / availability ----------------------------------------------------
  // `isAvailable` and `isVerified` are hard filters above, so what remains to weigh here is
  // service reliability (average feedback rating). Agents without history are treated as
  // neutral rather than worst, so a new agent is assignable but not preferred.
  const reliability = candidate.ratingAvg > 0 ? clamp01(candidate.ratingAvg / 5) : (config.neutralReliability ?? NEUTRAL_RELIABILITY_SCORE);

  // ---- Vehicle capacity --------------------------------------------------------------
  const capacityScore = clamp01(
    peerMaxCapacityKg > 0 ? candidate.vehicleCapacityKg / peerMaxCapacityKg : 0,
  );

  const { weights } = config;
  const totalScore =
    weights.distance * distanceScore +
    weights.workload * workloadScore +
    weights.availability * reliability +
    weights.capacity * capacityScore;

  return {
    agentProfileId: candidate.agentProfileId,
    userId: candidate.userId,
    fullName: candidate.fullName,
    eligible: exclusionReasons.length === 0,
    exclusionReasons,
    distanceKm,
    distanceSource,
    components: {
      distance: round(distanceScore, 4),
      workload: round(workloadScore, 4),
      reliability: round(reliability, 4),
      capacity: round(capacityScore, 4),
    },
    totalScore: round(totalScore, 4),
    currentLoadCount: candidate.currentLoadCount,
    maxDailyPickups: candidate.maxDailyPickups,
    utilizationPct:
      candidate.maxDailyPickups > 0
        ? Math.round((candidate.currentLoadCount / candidate.maxDailyPickups) * 100)
        : 100,
    ratingAvg: round(candidate.ratingAvg, 2),
    vehicleCapacityKg: round(candidate.vehicleCapacityKg, 2),
  };
}

/**
 * Scores every candidate and returns them ordered best-first.
 *
 * The comparator is a *total order* including deterministic tie-breakers, so the result
 * never depends on database row order:
 *    1. higher total score
 *    2. shorter distance (known distances before unknown)
 *    3. fewer open pickups
 *    4. lower agent profile id  (stable, insertion-ordered identity)
 */
export function scoreCandidates(
  ctx: AssignmentContext,
  candidates: AgentCandidate[],
  config: AssignmentConfig = currentAssignmentConfig(),
): ScoredCandidate[] {
  const peerMaxCapacityKg = candidates.reduce((max, c) => Math.max(max, c.vehicleCapacityKg), 0);

  const scored = candidates.map((candidate) =>
    scoreCandidate(ctx, candidate, config, peerMaxCapacityKg),
  );

  return scored.sort(compareScoredCandidates);
}

export function compareScoredCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;

  if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
    return a.distanceKm - b.distanceKm;
  }
  if (a.distanceKm === null && b.distanceKm !== null) return 1; // unknown distance ranks lower
  if (a.distanceKm !== null && b.distanceKm === null) return -1;

  if (a.currentLoadCount !== b.currentLoadCount) return a.currentLoadCount - b.currentLoadCount;

  return a.agentProfileId - b.agentProfileId;
}

/** The single candidate the engine would choose, or `null` when nobody is eligible. */
export function selectBestCandidate(scored: ScoredCandidate[]): ScoredCandidate | null {
  const eligible = scored.filter((c) => c.eligible);
  return eligible.length > 0 ? eligible[0] : null;
}

// ---------------------------------------------------------------------------------------
// Persistence layer
// ---------------------------------------------------------------------------------------

const CANDIDATE_SELECT = {
  id: true,
  centerId: true,
  isAvailable: true,
  isVerified: true,
  currentLoadCount: true,
  maxDailyPickups: true,
  vehicleCapacityKg: true,
  ratingAvg: true,
  user: {
    select: { id: true, fullName: true, status: true, city: true, latitude: true, longitude: true },
  },
  center: { select: { id: true, city: true, latitude: true, longitude: true } },
} as const;

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value.toString());
  return Number.isFinite(num) ? num : null;
}

function toCoordinates(lat: unknown, lng: unknown): Coordinates | null {
  const latitude = toNumberOrNull(lat);
  const longitude = toNumberOrNull(lng);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

export async function loadCandidates(tx: Tx): Promise<AgentCandidate[]> {
  const rows = await tx.agentProfile.findMany({
    where: { user: { status: 'ACTIVE', role: 'COLLECTION_AGENT' } },
    select: CANDIDATE_SELECT,
  });

  return rows.map((row) => ({
    agentProfileId: row.id,
    userId: row.user.id,
    fullName: row.user.fullName,
    centerId: row.centerId,
    centerCity: row.center?.city ?? null,
    centerCoordinates: toCoordinates(row.center?.latitude ?? null, row.center?.longitude ?? null),
    userCity: row.user.city,
    userCoordinates: toCoordinates(row.user.latitude, row.user.longitude),
    isAvailable: row.isAvailable,
    isVerified: row.isVerified,
    currentLoadCount: row.currentLoadCount,
    maxDailyPickups: row.maxDailyPickups,
    vehicleCapacityKg: toNumberOrNull(row.vehicleCapacityKg) ?? 0,
    ratingAvg: toNumberOrNull(row.ratingAvg) ?? 0,
  }));
}

export interface AutoAssignResult {
  assigned: boolean;
  reason: string;
  pickupRequestId: number;
  agent?: { agentProfileId: number; userId: number; fullName: string; distanceKm: number | null };
  candidatesEvaluated: number;
  topCandidates: ScoredCandidate[];
}

/**
 * Runs the engine and records the assignment, in one transaction:
 *   lock request row → score candidates → pick winner → update request + agent load →
 *   advance items → write assignment log → write status history.
 *
 * Concurrency: the pickup row is locked with `SELECT ... FOR UPDATE`, so two coordinators
 * clicking "Assign" simultaneously cannot both succeed. The agent load counter is additionally
 * protected by the database CHECK `agent_load_within_max_chk`.
 */
export async function autoAssignPickup(
  pickupRequestId: number,
  actor: { id: number; role: 'ADMIN' | 'CENTER_STAFF' },
  options: { force?: boolean } = {},
): Promise<AutoAssignResult> {
  return prisma.$transaction(async (tx) => {
    // Row-level lock: blocks a concurrent assignment of the same request.
    await tx.$queryRaw`SELECT id FROM "pickup_requests" WHERE id = ${pickupRequestId} FOR UPDATE`;

    const request = await tx.pickupRequest.findUnique({
      where: { id: pickupRequestId },
      select: {
        id: true,
        status: true,
        city: true,
        pincode: true,
        latitude: true,
        longitude: true,
        centerId: true,
        agentId: true,
        estimatedWeightKg: true,
        items: { select: { id: true, status: true } },
      },
    });

    if (!request) throw new NotFoundError('Pickup request');

    if (options.force) {
      if (!['REQUESTED', 'FAILED', 'ASSIGNED'].includes(request.status)) {
        throw new ConflictError(
          `A request in status ${request.status} can no longer be (re)assigned`,
        );
      }
    } else {
      assertTransition('pickup', request.status, 'ASSIGNED', 'pickup request');
    }

    const ctx: AssignmentContext = {
      pickupRequestId: request.id,
      requestCity: request.city,
      requestPincode: request.pincode,
      requestCoordinates: toCoordinates(request.latitude, request.longitude),
      requestCenterId: request.centerId,
      estimatedWeightKg: toNumberOrNull(request.estimatedWeightKg),
    };

    const config = currentAssignmentConfig();
    const candidates = await loadCandidates(tx);
    const scored = scoreCandidates(ctx, candidates, config);
    const winner = selectBestCandidate(scored);
    const pool = scored.slice(0, env.ASSIGN_CANDIDATE_POOL);

    // --- No eligible agent: record the attempt and leave the request untouched ----------
    if (!winner) {
      const reason =
        candidates.length === 0
          ? 'No collection agents are registered in the system'
          : `No eligible agent found among ${candidates.length} candidate(s): all failed at least one eligibility rule`;

      await tx.assignmentLog.create({
        data: {
          pickupRequestId: request.id,
          assignedById: actor.id,
          method: 'AUTO',
          outcome: 'NO_ELIGIBLE_AGENT',
          reason,
          candidates: pool as unknown as object,
        },
      });

      await recordHistory(tx, {
        entityType: 'PICKUP_REQUEST',
        pickupRequestId: request.id,
        status: 'REQUESTED',
        note: `Automatic assignment attempted but no eligible agent was available. ${reason}`,
        actor,
        metadata: { outcome: 'NO_ELIGIBLE_AGENT', considered: candidates.length },
      });

      return {
        assigned: false,
        reason,
        pickupRequestId: request.id,
        candidatesEvaluated: candidates.length,
        topCandidates: pool,
      };
    }

    // --- Previous agent (reassignment) releases their slot ------------------------------
    if (request.agentId && request.agentId !== winner.agentProfileId) {
      await tx.$executeRaw`
        UPDATE "agent_profiles"
        SET current_load_count = GREATEST(current_load_count - 1, 0)
        WHERE id = ${request.agentId}`;
    }

    // --- Claim the slot on the winning agent -------------------------------------------
    await tx.agentProfile.update({
      where: { id: winner.agentProfileId },
      data: { currentLoadCount: { increment: 1 } },
    });

    const isReassignment = request.agentId !== null;
    const reason = buildReason(winner, scored);

    await tx.pickupRequest.update({
      where: { id: request.id },
      data: {
        agentId: winner.agentProfileId,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        failureReason: null,
      },
    });

    // Items that are still waiting become scheduled for pickup.
    const schedulable = request.items.filter((item) => item.status === 'SUBMITTED').map((item) => item.id);
    if (schedulable.length > 0) {
      await tx.ewasteItem.updateMany({
        where: { id: { in: schedulable } },
        data: { status: 'PICKUP_SCHEDULED' },
      });
      await recordHistoryForItems(tx, schedulable, 'PICKUP_SCHEDULED', {
        note: `Pickup ${request.id} assigned to ${winner.fullName}`,
        actor,
      });
    }

    await tx.assignmentLog.create({
      data: {
        pickupRequestId: request.id,
        agentId: winner.agentProfileId,
        assignedById: actor.id,
        method: isReassignment ? 'REASSIGNMENT' : 'AUTO',
        outcome: 'ASSIGNED',
        score: winner.totalScore,
        distanceKm: winner.distanceKm,
        reason,
        candidates: pool as unknown as object,
      },
    });

    await recordHistory(tx, {
      entityType: 'PICKUP_REQUEST',
      pickupRequestId: request.id,
      status: 'ASSIGNED',
      note: isReassignment
        ? `Reassigned to ${winner.fullName}. ${reason}`
        : `Assigned to ${winner.fullName}. ${reason}`,
      actor,
      metadata: {
        method: isReassignment ? 'REASSIGNMENT' : 'AUTO',
        score: winner.totalScore,
        distanceKm: winner.distanceKm,
        components: winner.components,
      },
    });

    return {
      assigned: true,
      reason,
      pickupRequestId: request.id,
      agent: {
        agentProfileId: winner.agentProfileId,
        userId: winner.userId,
        fullName: winner.fullName,
        distanceKm: winner.distanceKm,
      },
      candidatesEvaluated: candidates.length,
      topCandidates: pool,
    };
  });
}

function buildReason(winner: ScoredCandidate, scored: ScoredCandidate[]): string {
  const eligibleCount = scored.filter((c) => c.eligible).length;
  return [
    `Selected ${winner.fullName} (score ${winner.totalScore.toFixed(4)} of 1.0000,`,
    winner.distanceKm !== null
      ? `distance ${winner.distanceKm.toFixed(2)} km via ${winner.distanceSource})`
      : `distance unknown — ${winner.distanceSource} fallback used)`,
    `from ${eligibleCount} eligible candidate(s) of ${scored.length} evaluated.`,
    `Load ${winner.currentLoadCount}/${winner.maxDailyPickups} before assignment.`,
  ].join(' ');
}

/**
 * Manual assignment performed by an administrator or centre staff member.
 * The chosen agent still has to pass the eligibility filters (unless `force` is used by an
 * administrator), and the decision is logged with the actor's id.
 */
export async function manualAssignPickup(
  pickupRequestId: number,
  agentProfileId: number,
  actor: { id: number; role: 'ADMIN' | 'CENTER_STAFF' },
  options: { force?: boolean; reason?: string } = {},
): Promise<AutoAssignResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "pickup_requests" WHERE id = ${pickupRequestId} FOR UPDATE`;

    const request = await tx.pickupRequest.findUnique({
      where: { id: pickupRequestId },
      select: {
        id: true,
        status: true,
        city: true,
        pincode: true,
        latitude: true,
        longitude: true,
        centerId: true,
        agentId: true,
        estimatedWeightKg: true,
        items: { select: { id: true, status: true } },
      },
    });
    if (!request) throw new NotFoundError('Pickup request');

    if (!['REQUESTED', 'FAILED', 'ASSIGNED'].includes(request.status)) {
      throw new ConflictError(`A request in status ${request.status} can no longer be assigned`);
    }

    const candidates = await loadCandidates(tx);
    const target = candidates.find((c) => c.agentProfileId === agentProfileId);
    if (!target) throw new NotFoundError('Collection agent');

    const ctx: AssignmentContext = {
      pickupRequestId: request.id,
      requestCity: request.city,
      requestPincode: request.pincode,
      requestCoordinates: toCoordinates(request.latitude, request.longitude),
      requestCenterId: request.centerId,
      estimatedWeightKg: toNumberOrNull(request.estimatedWeightKg),
    };

    const config = currentAssignmentConfig();
    const peerMax = candidates.reduce((max, c) => Math.max(max, c.vehicleCapacityKg), 0);
    const scored = scoreCandidate(ctx, target, config, peerMax);

    // `force` lets an administrator override the *soft* filters, but never the hard
    // safety rules (unverified, suspended, at-capacity agents are always refused).
    const hardBlockers = scored.exclusionReasons.filter(
      (r) => !options.force || !r.startsWith('Agent belongs to a different collection centre'),
    );

    if (hardBlockers.length > 0) {
      const reason = `Manual assignment refused: ${hardBlockers.join('; ')}`;
      await tx.assignmentLog.create({
        data: {
          pickupRequestId: request.id,
          agentId: agentProfileId,
          assignedById: actor.id,
          method: 'MANUAL',
          outcome: 'SKIPPED',
          score: scored.totalScore,
          distanceKm: scored.distanceKm,
          reason,
          candidates: [scored] as unknown as object,
        },
      });
      throw new ConflictError(reason, { exclusionReasons: hardBlockers });
    }

    if (request.agentId === agentProfileId) {
      throw new ConflictError('This pickup request is already assigned to the selected agent');
    }

    if (request.agentId) {
      await tx.$executeRaw`
        UPDATE "agent_profiles"
        SET current_load_count = GREATEST(current_load_count - 1, 0)
        WHERE id = ${request.agentId}`;
    }

    await tx.agentProfile.update({
      where: { id: agentProfileId },
      data: { currentLoadCount: { increment: 1 } },
    });

    await tx.pickupRequest.update({
      where: { id: request.id },
      data: {
        agentId: agentProfileId,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        failureReason: null,
      },
    });

    const schedulable = request.items.filter((item) => item.status === 'SUBMITTED').map((item) => item.id);
    if (schedulable.length > 0) {
      await tx.ewasteItem.updateMany({
        where: { id: { in: schedulable } },
        data: { status: 'PICKUP_SCHEDULED' },
      });
      await recordHistoryForItems(tx, schedulable, 'PICKUP_SCHEDULED', {
        note: `Pickup ${request.id} assigned to ${target.fullName} (manual)`,
        actor,
      });
    }

    const isReassignment = request.agentId !== null;

    await tx.assignmentLog.create({
      data: {
        pickupRequestId: request.id,
        agentId: agentProfileId,
        assignedById: actor.id,
        method: 'MANUAL',
        outcome: 'ASSIGNED',
        score: scored.totalScore,
        distanceKm: scored.distanceKm,
        reason: options.reason ?? `Manually assigned to ${target.fullName} by ${actor.role}`,
        candidates: [scored] as unknown as object,
      },
    });

    await recordHistory(tx, {
      entityType: 'PICKUP_REQUEST',
      pickupRequestId: request.id,
      status: 'ASSIGNED',
      note: `${isReassignment ? 'Reassigned' : 'Assigned'} to ${target.fullName} (manual assignment by ${actor.role}).`,
      actor,
      metadata: { method: 'MANUAL', score: scored.totalScore, distanceKm: scored.distanceKm },
    });

    return {
      assigned: true,
      reason: `Manually assigned to ${target.fullName}`,
      pickupRequestId: request.id,
      agent: {
        agentProfileId: target.agentProfileId,
        userId: target.userId,
        fullName: target.fullName,
        distanceKm: scored.distanceKm,
      },
      candidatesEvaluated: candidates.length,
      topCandidates: [scored],
    };
  });
}

/** Preview used by the UI: "who would the engine pick, and why?" — makes no writes. */
export async function previewAssignment(pickupRequestId: number) {
  const request = await prisma.pickupRequest.findUnique({
    where: { id: pickupRequestId },
    select: {
      id: true,
      status: true,
      city: true,
      pincode: true,
      latitude: true,
      longitude: true,
      centerId: true,
      estimatedWeightKg: true,
    },
  });
  if (!request) throw new NotFoundError('Pickup request');

  const ctx: AssignmentContext = {
    pickupRequestId: request.id,
    requestCity: request.city,
    requestPincode: request.pincode,
    requestCoordinates: toCoordinates(request.latitude, request.longitude),
    requestCenterId: request.centerId,
    estimatedWeightKg: toNumberOrNull(request.estimatedWeightKg),
  };

  const config = currentAssignmentConfig();
  const candidates = await loadCandidates(prisma as unknown as Tx);
  const scored = scoreCandidates(ctx, candidates, config);

  return {
    pickupRequestId: request.id,
    currentStatus: request.status,
    locationSource: resolveRequestLocation(ctx).source,
    config: {
      maxDistanceKm: config.maxDistanceKm,
      weights: config.weights,
    },
    recommended: selectBestCandidate(scored),
    candidates: scored.slice(0, env.ASSIGN_CANDIDATE_POOL),
    totalCandidates: scored.length,
    eligibleCandidates: scored.filter((c) => c.eligible).length,
  };
}
