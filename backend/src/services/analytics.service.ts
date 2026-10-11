import { Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { toNumber } from '../utils/queryFilters';
import { itemAccessFilter } from './item.service';
import { pickupAccessFilter } from './pickup.service';
import { batchAccessFilter } from './batch.service';
import { recoveryAccessFilter } from './recovery.service';
import { recentActivity } from './history.service';

/**
 * =====================================================================================
 *  Analytics
 * =====================================================================================
 *  Every number returned here is computed from stored rows at request time — no cached
 *  counters, no hard-coded demo values. Each metric is scoped to what the requesting role
 *  is allowed to see, so a user's dashboard can never leak platform-wide figures.
 *
 *  Aggregations use Prisma's `groupBy`/`aggregate` where the query is expressible in the
 *  schema DSL, and parameterised raw SQL (`$queryRaw`) for month bucketing and multi-table
 *  reporting, which the DSL cannot express. Raw queries are always parameterised via
 *  Prisma.sql — no string interpolation of user input.
 * =====================================================================================
 */

export interface MonthlyPoint {
  month: string; // YYYY-MM
  submissions: number;
  collected: number;
  recovered: number;
  recoveredQuantityKg: number;
}

/** Scope helpers — each returns the WHERE fragment for the actor's visibility. */
function itemScope(actor: AuthUser) {
  return itemAccessFilter(actor);
}
function pickupScope(actor: AuthUser) {
  return pickupAccessFilter(actor);
}
function batchScope(actor: AuthUser) {
  return batchAccessFilter(actor);
}
function recoveryScope(actor: AuthUser) {
  return recoveryAccessFilter(actor);
}

/** Headline counters. */
export async function getSummary(actor: AuthUser) {
  const itemWhere = itemScope(actor);
  const pickupWhere = pickupScope(actor);

  const [
    items,
    itemsByStatus,
    pickups,
    pickupsByStatus,
    inspections,
    batches,
    batchesByStatus,
    recovery,
    userCounts,
    centerCount,
  ] = await Promise.all([
    prisma.ewasteItem.aggregate({ where: itemWhere, _count: { _all: true }, _sum: { estimatedWeightKg: true } }),
    prisma.ewasteItem.groupBy({ by: ['status'], where: itemWhere, _count: { _all: true } }),
    prisma.pickupRequest.count({ where: pickupWhere }),
    prisma.pickupRequest.groupBy({ by: ['status'], where: pickupWhere, _count: { _all: true } }),
    prisma.inspection.aggregate({
      where: { item: itemWhere },
      _count: { _all: true },
      _sum: { actualWeightKg: true },
      _avg: { qualityScore: true },
    }),
    prisma.processingBatch.count({ where: batchScope(actor) }),
    prisma.processingBatch.groupBy({ by: ['status'], where: batchScope(actor), _count: { _all: true } }),
    prisma.recoveredMaterial.aggregate({
      where: recoveryScope(actor),
      _sum: { quantityKg: true },
      _count: { _all: true },
    }),
    actor.role === 'ADMIN'
      ? prisma.user.groupBy({ by: ['role'], _count: { _all: true } })
      : Promise.resolve([] as Array<{ role: string; _count: { _all: number } }>),
    actor.role === 'ADMIN'
      ? prisma.collectionCenter.count()
      : Promise.resolve<number | null>(null),
  ]);

  const inspectedWeight = toNumber(inspections._sum.actualWeightKg);
  const recoveredWeight = toNumber(recovery._sum.quantityKg);

  return {
    items: {
      total: items._count._all,
      estimatedWeightKg: Math.round(toNumber(items._sum.estimatedWeightKg) * 1000) / 1000,
      byStatus: itemsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    },
    pickups: {
      total: pickups,
      byStatus: pickupsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    },
    inspections: {
      completed: inspections._count._all,
      measuredWeightKg: Math.round(inspectedWeight * 1000) / 1000,
      averageQualityScore: inspections._avg.qualityScore
        ? Math.round(toNumber(inspections._avg.qualityScore) * 10) / 10
        : null,
    },
    batches: {
      total: batches,
      byStatus: batchesByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    },
    recovery: {
      records: recovery._count._all,
      quantityKg: Math.round(recoveredWeight * 1000) / 1000,
      // Recovery yield is only meaningful once something has been inspected.
      yieldPct: inspectedWeight > 0 ? Math.round((recoveredWeight / inspectedWeight) * 1000) / 10 : null,
    },
    users: userCounts.map((r) => ({ role: r.role, count: r._count._all })),
    collectionCenters: centerCount,
  };
}

/**
 * Monthly lifecycle trend.
 *
 * Uses `date_trunc` in PostgreSQL so bucketing happens in the database (correct across
 * timezones and DST, unlike computing months in application code).
 */
export async function getMonthlyTrend(actor: AuthUser, months = 6): Promise<MonthlyPoint[]> {
  const safeMonths = Math.min(Math.max(Math.trunc(months) || 6, 1), 36);
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - (safeMonths - 1));
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  // Role scoping expressed as SQL fragments (parameterised, never interpolated).
  const itemOwnerFilter =
    actor.role === 'ADMIN' ? Prisma.empty
    : actor.role === 'USER' ? Prisma.sql`AND i.user_id = ${actor.id}`
    : actor.role === 'CENTER_STAFF' && actor.staffedCenterId ? Prisma.sql`AND i.center_id = ${actor.staffedCenterId}`
    : actor.role === 'RECYCLER' ? Prisma.sql`AND EXISTS (SELECT 1 FROM batch_items bi JOIN processing_batches b ON b.id = bi.batch_id WHERE bi.item_id = i.id AND b.recycler_id = ${actor.id})`
    : actor.role === 'COLLECTION_AGENT' && actor.agentProfileId ? Prisma.sql`AND EXISTS (SELECT 1 FROM pickup_requests p WHERE p.id = i.pickup_request_id AND p.agent_id = ${actor.agentProfileId})`
    : Prisma.sql`AND FALSE`;

  const recoveryFilter =
    actor.role === 'ADMIN' ? Prisma.empty
    : actor.role === 'RECYCLER' ? Prisma.sql`AND b.recycler_id = ${actor.id}`
    : actor.role === 'CENTER_STAFF' && actor.staffedCenterId ? Prisma.sql`AND b.center_id = ${actor.staffedCenterId}`
    : actor.role === 'USER' ? Prisma.sql`AND (rm.item_id IS NULL OR EXISTS (SELECT 1 FROM ewaste_items i2 WHERE i2.id = rm.item_id AND i2.user_id = ${actor.id}))`
    : Prisma.sql`AND FALSE`;

  const [submissions, collected, recovered] = await Promise.all([
    prisma.$queryRaw<Array<{ month: string; count: bigint }>>(Prisma.sql`
      SELECT to_char(date_trunc('month', i.created_at), 'YYYY-MM') AS month, count(*) AS count
      FROM ewaste_items i
      WHERE i.created_at >= ${since} ${itemOwnerFilter}
      GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<Array<{ month: string; count: bigint }>>(Prisma.sql`
      SELECT to_char(date_trunc('month', p.collected_at), 'YYYY-MM') AS month, count(*) AS count
      FROM pickup_requests p
      WHERE p.collected_at IS NOT NULL AND p.collected_at >= ${since}
        ${actor.role === 'ADMIN' ? Prisma.empty
          : actor.role === 'COLLECTION_AGENT' && actor.agentProfileId ? Prisma.sql`AND p.agent_id = ${actor.agentProfileId}`
          : actor.role === 'USER' ? Prisma.sql`AND p.user_id = ${actor.id}`
          : actor.role === 'CENTER_STAFF' && actor.staffedCenterId ? Prisma.sql`AND p.center_id = ${actor.staffedCenterId}`
          : Prisma.sql`AND FALSE`}
      GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<Array<{ month: string; quantity: number; records: bigint }>>(Prisma.sql`
      SELECT to_char(date_trunc('month', rm.recorded_at), 'YYYY-MM') AS month,
             coalesce(sum(rm.quantity_kg), 0)::float8 AS quantity,
             count(*) AS records
      FROM recovered_materials rm
      JOIN processing_batches b ON b.id = rm.batch_id
      WHERE rm.recorded_at >= ${since} ${recoveryFilter}
      GROUP BY 1 ORDER BY 1`),
  ]);

  // Build a dense, ordered series so charts never show gaps for quiet months.
  const buckets = new Map<string, MonthlyPoint>();
  for (let i = 0; i < safeMonths; i += 1) {
    const d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, { month: key, submissions: 0, collected: 0, recovered: 0, recoveredQuantityKg: 0 });
  }

  for (const row of submissions) {
    const bucket = buckets.get(row.month);
    if (bucket) bucket.submissions = Number(row.count);
  }
  for (const row of collected) {
    const bucket = buckets.get(row.month);
    if (bucket) bucket.collected = Number(row.count);
  }
  for (const row of recovered) {
    const bucket = buckets.get(row.month);
    if (bucket) {
      bucket.recovered = Number(row.records);
      bucket.recoveredQuantityKg = Math.round(Number(row.quantity) * 1000) / 1000;
    }
  }

  return [...buckets.values()];
}

/** E-waste mix by category (top N + remainder). */
export async function getCategoryMix(actor: AuthUser, limit = 8) {
  const grouped = await prisma.ewasteItem.groupBy({
    by: ['categoryId'],
    where: itemScope(actor),
    _count: { _all: true },
    _sum: { estimatedWeightKg: true },
    orderBy: { _count: { categoryId: 'desc' } },
  });

  const categories = await prisma.category.findMany({
    where: { id: { in: grouped.map((g) => g.categoryId) } },
    select: { id: true, name: true, hazardLevel: true, defaultPath: true },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));

  return grouped.slice(0, limit).map((row) => ({
    categoryId: row.categoryId,
    name: byId.get(row.categoryId)?.name ?? 'Unknown',
    hazardLevel: byId.get(row.categoryId)?.hazardLevel ?? 1,
    defaultPath: byId.get(row.categoryId)?.defaultPath ?? null,
    count: row._count._all,
    estimatedWeightKg: Math.round(toNumber(row._sum.estimatedWeightKg) * 1000) / 1000,
  }));
}

/** Recovery totals per material type. */
export async function getMaterialRecovery(actor: AuthUser) {
  const grouped = await prisma.recoveredMaterial.groupBy({
    by: ['materialType'],
    where: recoveryScope(actor),
    _sum: { quantityKg: true },
    _count: { _all: true },
    _avg: { purityPct: true },
  });

  return grouped
    .map((row) => ({
      materialType: row.materialType,
      quantityKg: Math.round(toNumber(row._sum.quantityKg) * 1000) / 1000,
      records: row._count._all,
      averagePurityPct: row._avg.purityPct ? Math.round(toNumber(row._avg.purityPct) * 10) / 10 : null,
    }))
    .sort((a, b) => b.quantityKg - a.quantityKg);
}

/**
 * Per-centre performance report.
 *
 * Demonstrates correlated subqueries + aggregation in one statement; using scalar
 * subqueries (rather than joining every table at once) avoids the row-multiplication
 * problem that would otherwise inflate the weight totals.
 */
export async function getCenterPerformance() {
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      name: string;
      code: string;
      city: string;
      status: string;
      capacity_kg: number;
      items_received: bigint;
      inspections: bigint;
      inspected_weight_kg: number;
      batches: bigint;
      completed_batches: bigint;
      recovered_weight_kg: number;
      staff_count: bigint;
      agent_count: bigint;
    }>
  >(Prisma.sql`
    SELECT c.id,
           c.name,
           c.code,
           c.city,
           c.status::text                        AS status,
           c.capacity_kg::float8                 AS capacity_kg,
           (SELECT count(*) FROM ewaste_items i WHERE i.center_id = c.id) AS items_received,
           (SELECT count(*) FROM inspections ins WHERE ins.center_id = c.id) AS inspections,
           (SELECT coalesce(sum(ins.actual_weight_kg), 0) FROM inspections ins WHERE ins.center_id = c.id)::float8 AS inspected_weight_kg,
           (SELECT count(*) FROM processing_batches b WHERE b.center_id = c.id) AS batches,
           (SELECT count(*) FROM processing_batches b WHERE b.center_id = c.id AND b.status = 'COMPLETED') AS completed_batches,
           (SELECT coalesce(sum(rm.quantity_kg), 0)
              FROM processing_batches b
              JOIN recovered_materials rm ON rm.batch_id = b.id
             WHERE b.center_id = c.id)::float8 AS recovered_weight_kg,
           (SELECT count(*) FROM users u WHERE u.staffed_center_id = c.id) AS staff_count,
           (SELECT count(*) FROM agent_profiles ap WHERE ap.center_id = c.id) AS agent_count
    FROM collection_centers c
    ORDER BY items_received DESC, c.name ASC`);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    city: row.city,
    status: row.status,
    capacityKg: Number(row.capacity_kg),
    itemsReceived: Number(row.items_received),
    inspections: Number(row.inspections),
    inspectedWeightKg: Math.round(Number(row.inspected_weight_kg) * 1000) / 1000,
    batches: Number(row.batches),
    completedBatches: Number(row.completed_batches),
    recoveredWeightKg: Math.round(Number(row.recovered_weight_kg) * 1000) / 1000,
    recoveryRatePct:
      Number(row.inspected_weight_kg) > 0
        ? Math.round((Number(row.recovered_weight_kg) / Number(row.inspected_weight_kg)) * 1000) / 10
        : null,
    staffCount: Number(row.staff_count),
    agentCount: Number(row.agent_count),
  }));
}

/** Agent workload & performance, straight from pickup/assignment records. */
export async function getAgentPerformance() {
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      user_id: number;
      full_name: string;
      city: string | null;
      is_available: boolean;
      is_verified: boolean;
      current_load_count: number;
      max_daily_pickups: number;
      rating_avg: number;
      vehicle_capacity_kg: number;
      open_pickups: bigint;
      completed_pickups: bigint;
      failed_pickups: bigint;
      collected_weight_kg: number;
      distance_km_avg: number | null;
    }>
  >(Prisma.sql`
    SELECT ap.id,
           u.id                                   AS user_id,
           u.full_name,
           u.city,
           ap.is_available,
           ap.is_verified,
           ap.current_load_count,
           ap.max_daily_pickups,
           ap.rating_avg::float8                  AS rating_avg,
           ap.vehicle_capacity_kg::float8         AS vehicle_capacity_kg,
           (SELECT count(*) FROM pickup_requests p WHERE p.agent_id = ap.id AND p.status IN ('ASSIGNED', 'ACCEPTED')) AS open_pickups,
           (SELECT count(*) FROM pickup_requests p WHERE p.agent_id = ap.id AND p.status IN ('COLLECTED', 'RECEIVED_AT_CENTER')) AS completed_pickups,
           (SELECT count(*) FROM pickup_requests p WHERE p.agent_id = ap.id AND p.status = 'FAILED') AS failed_pickups,
           (SELECT coalesce(sum(p.collected_weight_kg), 0) FROM pickup_requests p WHERE p.agent_id = ap.id)::float8 AS collected_weight_kg,
           (SELECT avg(al.distance_km) FROM assignment_logs al WHERE al.agent_id = ap.id AND al.outcome = 'ASSIGNED')::float8 AS distance_km_avg
    FROM agent_profiles ap
    JOIN users u ON u.id = ap.user_id
    WHERE u.status = 'ACTIVE'
    ORDER BY completed_pickups DESC, u.full_name ASC`);

  return rows.map((row) => ({
    agentProfileId: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    city: row.city,
    isAvailable: row.is_available,
    isVerified: row.is_verified,
    currentLoadCount: row.current_load_count,
    maxDailyPickups: row.max_daily_pickups,
    utilizationPct:
      row.max_daily_pickups > 0 ? Math.round((row.current_load_count / row.max_daily_pickups) * 100) : 0,
    ratingAvg: Math.round(Number(row.rating_avg) * 100) / 100,
    vehicleCapacityKg: Number(row.vehicle_capacity_kg),
    openPickups: Number(row.open_pickups),
    completedPickups: Number(row.completed_pickups),
    failedPickups: Number(row.failed_pickups),
    collectedWeightKg: Math.round(Number(row.collected_weight_kg) * 1000) / 1000,
    averageAssignmentDistanceKm:
      row.distance_km_avg === null ? null : Math.round(Number(row.distance_km_avg) * 100) / 100,
    completionRatePct:
      Number(row.completed_pickups) + Number(row.failed_pickups) > 0
        ? Math.round(
            (Number(row.completed_pickups) /
              (Number(row.completed_pickups) + Number(row.failed_pickups))) *
              1000,
          ) / 10
        : null,
  }));
}

/** Recycler throughput and recovery value. */
export async function getRecyclerPerformance() {
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      user_id: number;
      full_name: string;
      organization_name: string;
      license_number: string;
      is_active: boolean;
      accepted_materials: string[];
      max_capacity_kg: number;
      total_batches: bigint;
      open_batches: bigint;
      completed_batches: bigint;
      items_processed: bigint;
      recovered_kg: number;
      recovered_value: number;
      average_purity: number | null;
    }>
  >(Prisma.sql`
    SELECT rp.id,
           u.id                            AS user_id,
           u.full_name,
           rp.organization_name,
           rp.license_number,
           rp.is_active,
           rp.accepted_materials::text[]   AS accepted_materials,
           rp.max_capacity_kg::float8      AS max_capacity_kg,
           (SELECT count(*) FROM processing_batches b WHERE b.recycler_id = u.id) AS total_batches,
           (SELECT count(*) FROM processing_batches b WHERE b.recycler_id = u.id AND b.status IN ('RELEASED', 'IN_PROGRESS')) AS open_batches,
           (SELECT count(*) FROM processing_batches b WHERE b.recycler_id = u.id AND b.status = 'COMPLETED') AS completed_batches,
           (SELECT count(*) FROM batch_items bi JOIN processing_batches b ON b.id = bi.batch_id WHERE b.recycler_id = u.id) AS items_processed,
           (SELECT coalesce(sum(rm.quantity_kg), 0) FROM recovered_materials rm WHERE rm.recorded_by_id = u.id)::float8 AS recovered_kg,
           (SELECT coalesce(sum(rm.quantity_kg * coalesce(rm.market_value_per_kg, 0)), 0) FROM recovered_materials rm WHERE rm.recorded_by_id = u.id)::float8 AS recovered_value,
           (SELECT avg(rm.purity_pct) FROM recovered_materials rm WHERE rm.recorded_by_id = u.id)::float8 AS average_purity
    FROM recycler_profiles rp
    JOIN users u ON u.id = rp.user_id
    ORDER BY recovered_kg DESC, rp.organization_name ASC`);

  return rows.map((row) => ({
    recyclerProfileId: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    organizationName: row.organization_name,
    licenseNumber: row.license_number,
    isActive: row.is_active,
    acceptedMaterials: row.accepted_materials,
    maxCapacityKg: Number(row.max_capacity_kg),
    totalBatches: Number(row.total_batches),
    openBatches: Number(row.open_batches),
    completedBatches: Number(row.completed_batches),
    itemsProcessed: Number(row.items_processed),
    recoveredKg: Math.round(Number(row.recovered_kg) * 1000) / 1000,
    recoveredValue: Math.round(Number(row.recovered_value) * 100) / 100,
    averagePurityPct: row.average_purity === null ? null : Math.round(Number(row.average_purity) * 10) / 10,
  }));
}

/** Assignment-engine transparency report: how often the engine found nobody. */
export async function getAssignmentStats() {
  const [byOutcome, byMethod, avgScore, recentFailures] = await Promise.all([
    prisma.assignmentLog.groupBy({ by: ['outcome'], _count: { _all: true } }),
    prisma.assignmentLog.groupBy({ by: ['method'], _count: { _all: true } }),
    prisma.assignmentLog.aggregate({ where: { outcome: 'ASSIGNED' }, _avg: { score: true, distanceKm: true } }),
    prisma.assignmentLog.findMany({
      where: { outcome: { not: 'ASSIGNED' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        reason: true,
        outcome: true,
        createdAt: true,
        pickupRequest: { select: { id: true, requestCode: true, city: true } },
      },
    }),
  ]);

  const total = byOutcome.reduce((sum, row) => sum + row._count._all, 0);
  const assigned = byOutcome.find((r) => r.outcome === 'ASSIGNED')?._count._all ?? 0;

  return {
    totalAttempts: total,
    byOutcome: byOutcome.map((r) => ({ outcome: r.outcome, count: r._count._all })),
    byMethod: byMethod.map((r) => ({ method: r.method, count: r._count._all })),
    successRatePct: total > 0 ? Math.round((assigned / total) * 1000) / 10 : null,
    averageScore: avgScore._avg.score ? Math.round(toNumber(avgScore._avg.score) * 10000) / 10000 : null,
    averageDistanceKm: avgScore._avg.distanceKm ? Math.round(toNumber(avgScore._avg.distanceKm) * 100) / 100 : null,
    recentFailures,
  };
}

/** Average time between lifecycle milestones, computed in SQL. */
export async function getCycleTimes() {
  const rows = await prisma.$queryRaw<
    Array<{
      stage: string;
      sample_size: bigint;
      average_hours: number | null;
    }>
  >(Prisma.sql`
    WITH stages AS (
      SELECT 'REQUESTED → COLLECTED' AS stage,
             count(*) FILTER (WHERE collected_at IS NOT NULL) AS sample_size,
             avg(EXTRACT(EPOCH FROM (collected_at - created_at)) / 3600.0) AS average_hours
      FROM pickup_requests
      UNION ALL
      SELECT 'COLLECTED → RECEIVED_AT_CENTER',
             count(*) FILTER (WHERE received_at IS NOT NULL),
             avg(EXTRACT(EPOCH FROM (received_at - collected_at)) / 3600.0)
      FROM pickup_requests
      UNION ALL
      SELECT 'RECEIVED → INSPECTED',
             (SELECT count(*) FROM inspections ins JOIN ewaste_items i ON i.id = ins.item_id WHERE i.center_id IS NOT NULL),
             (SELECT avg(EXTRACT(EPOCH FROM (ins.inspected_at - p.received_at)) / 3600.0)
                FROM inspections ins
                JOIN ewaste_items i ON i.id = ins.item_id
                JOIN pickup_requests p ON p.id = i.pickup_request_id
               WHERE p.received_at IS NOT NULL)
      UNION ALL
      SELECT 'RELEASED → COMPLETED',
             count(*) FILTER (WHERE completed_at IS NOT NULL AND released_at IS NOT NULL),
             avg(EXTRACT(EPOCH FROM (completed_at - released_at)) / 3600.0)
      FROM processing_batches
    )
    SELECT stage, sample_size, average_hours::float8 AS average_hours
    FROM stages`);

  return rows.map((row) => ({
    stage: row.stage,
    sampleSize: Number(row.sample_size),
    averageHours: row.average_hours === null ? null : Math.round(Number(row.average_hours) * 100) / 100,
  }));
}

export interface OverviewPayload {
  role: string;
  generatedAt: string;
  summary: Awaited<ReturnType<typeof getSummary>>;
  monthly: MonthlyPoint[];
  materialRecovery: Awaited<ReturnType<typeof getMaterialRecovery>>;
  categoryMix: Awaited<ReturnType<typeof getCategoryMix>>;
}

/** One call that powers the analytics screen for any role. */
export async function getOverview(actor: AuthUser, months = 6): Promise<OverviewPayload> {
  const [summary, monthly, materialRecovery, categoryMix] = await Promise.all([
    getSummary(actor),
    getMonthlyTrend(actor, months),
    getMaterialRecovery(actor),
    getCategoryMix(actor),
  ]);

  return {
    role: actor.role,
    generatedAt: new Date().toISOString(),
    summary,
    monthly,
    materialRecovery,
    categoryMix,
  };
}

export { recentActivity };
