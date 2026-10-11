import type { AuthUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../lib/errors';
import { toNumber } from '../utils/queryFilters';
import { itemAccessFilter } from './item.service';
import { pickupAccessFilter } from './pickup.service';
import { batchAccessFilter } from './batch.service';
import { recoveryAccessFilter } from './recovery.service';
import {
  getSummary,
  getMonthlyTrend,
  getMaterialRecovery,
  getCategoryMix,
  getAssignmentStats,
} from './analytics.service';
import { recentActivity } from './history.service';

/**
 * Role-specific dashboard payloads.
 *
 * Each dashboard is assembled from the same stores the detail screens use, scoped by the
 * caller's role — so a dashboard figure and the corresponding list screen can never
 * disagree. There are no hard-coded or placeholder values anywhere in this file.
 */

export async function getUserDashboard(actor: AuthUser) {
  const itemWhere = itemAccessFilter(actor);
  const pickupWhere = pickupAccessFilter(actor);

  const [
    summary,
    activePickups,
    recentItems,
    pendingPickups,
    recoveryForMyItems,
    categoryMix,
  ] = await Promise.all([
    getSummary(actor),
    prisma.pickupRequest.findMany({
      where: {
        AND: [
          pickupWhere,
          { status: { in: ['REQUESTED', 'ASSIGNED', 'ACCEPTED', 'COLLECTED'] } },
        ],
      },
      select: {
        id: true,
        requestCode: true,
        status: true,
        preferredDate: true,
        timeSlot: true,
        city: true,
        collectedAt: true,
        agent: {
          select: {
            id: true,
            vehicleType: true,
            user: { select: { id: true, fullName: true, phone: true } },
          },
        },
        _count: { select: { items: true } },
      },
      orderBy: { preferredDate: 'asc' },
      take: 5,
    }),
    prisma.ewasteItem.findMany({
      where: itemWhere,
      select: {
        id: true,
        itemCode: true,
        name: true,
        status: true,
        createdAt: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.pickupRequest.count({
      where: { AND: [pickupWhere, { status: 'REQUESTED' }] },
    }),
    prisma.recoveredMaterial.aggregate({
      where: recoveryAccessFilter(actor),
      _sum: { quantityKg: true },
      _count: { _all: true },
    }),
    getCategoryMix(actor, 5),
  ]);

  const [activity, monthly] = await Promise.all([
    prisma.statusHistory.findMany({
      where: {
        OR: [
          { item: { userId: actor.id } },
          { pickupRequest: { userId: actor.id } },
        ],
      },
      include: { actor: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    getMonthlyTrend(actor, 6),
  ]);

  return {
    role: actor.role,
    summary,
    activePickups,
    recentItems,
    awaitingAssignment: pendingPickups,
    recoveryAttributedToMyItems: {
      records: recoveryForMyItems._count._all,
      quantityKg: Math.round(toNumber(recoveryForMyItems._sum.quantityKg) * 1000) / 1000,
    },
    categoryMix,
    monthly,
    recentActivity: activity,
  };
}

export async function getAgentDashboard(actor: AuthUser) {
  if (!actor.agentProfileId) {
    throw new ForbiddenError('Your account has no collection-agent profile');
  }

  const [profile, activePickups, todaySchedule, stats, activity] = await Promise.all([
    prisma.agentProfile.findUnique({
      where: { id: actor.agentProfileId },
      select: {
        id: true,
        isAvailable: true,
        isVerified: true,
        currentLoadCount: true,
        maxDailyPickups: true,
        ratingAvg: true,
        vehicleType: true,
        vehicleCapacityKg: true,
        center: { select: { id: true, name: true, code: true, city: true, addressLine: true } },
      },
    }),
    prisma.pickupRequest.findMany({
      where: {
        agentId: actor.agentProfileId,
        status: { in: ['ASSIGNED', 'ACCEPTED'] },
      },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
        center: { select: { id: true, name: true } },
        items: { select: { id: true, itemCode: true, name: true, status: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    }),
    prisma.pickupRequest.findMany({
      where: {
        agentId: actor.agentProfileId,
        status: { in: ['COLLECTED'] },
      },
      select: {
        id: true,
        requestCode: true,
        status: true,
        collectedAt: true,
        collectedWeightKg: true,
        city: true,
        _count: { select: { items: true } },
      },
      orderBy: { collectedAt: 'desc' },
      take: 10,
    }),
    (async () => {
      const [completed, failed, collectedWeight, logs] = await Promise.all([
        prisma.pickupRequest.count({
          where: { agentId: actor.agentProfileId, status: { in: ['COLLECTED', 'RECEIVED_AT_CENTER'] } },
        }),
        prisma.pickupRequest.count({ where: { agentId: actor.agentProfileId, status: 'FAILED' } }),
        prisma.pickupRequest.aggregate({
          where: { agentId: actor.agentProfileId },
          _sum: { collectedWeightKg: true },
        }),
        prisma.assignmentLog.findMany({
          where: { agentId: actor.agentProfileId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, outcome: true, method: true, score: true, distanceKm: true, reason: true, createdAt: true },
        }),
      ]);
      return {
        completedPickups: completed,
        failedPickups: failed,
        collectedWeightKg: Math.round(toNumber(collectedWeight._sum.collectedWeightKg) * 1000) / 1000,
        completionRatePct:
          completed + failed > 0 ? Math.round((completed / (completed + failed)) * 1000) / 10 : null,
        recentAssignments: logs,
      };
    })(),
    prisma.statusHistory.findMany({
      where: {
        OR: [
          { actorId: actor.id },
          { pickupRequest: { agentId: actor.agentProfileId } },
        ],
      },
      include: { actor: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
  ]);

  return {
    role: actor.role,
    profile: profile
      ? {
          ...profile,
          utilizationPct:
            profile.maxDailyPickups > 0
              ? Math.round((profile.currentLoadCount / profile.maxDailyPickups) * 100)
              : 0,
        }
      : null,
    activePickups,
    toBeDelivered: todaySchedule,
    stats,
    recentActivity: activity,
  };
}

export async function getCenterDashboard(actor: AuthUser) {
  const centerId = actor.staffedCenterId;
  if (!centerId && actor.role !== 'ADMIN') {
    throw new ForbiddenError('Your staff account is not attached to a collection centre');
  }

  const scope = centerId ? { centerId } : {};

  const [center, itemsByStatus, pendingInspection, incomingPickups, openBatches, recentInspections, stats] =
    await Promise.all([
      centerId
        ? prisma.collectionCenter.findUnique({
            where: { id: centerId },
            select: { id: true, name: true, code: true, city: true, capacityKg: true, status: true },
          })
        : null,
      prisma.ewasteItem.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
      prisma.ewasteItem.count({ where: { ...scope, status: 'RECEIVED_AT_CENTER', inspection: null } }),
      prisma.pickupRequest.findMany({
        where: {
          status: { in: ['COLLECTED'] },
          ...(centerId ? { OR: [{ centerId }, { centerId: null }] } : {}),
        },
        include: {
          user: { select: { id: true, fullName: true, phone: true } },
          agent: { select: { user: { select: { fullName: true, phone: true } } } },
          _count: { select: { items: true } },
        },
        orderBy: { collectedAt: 'asc' },
        take: 10,
      }),
      prisma.processingBatch.findMany({
        where: { ...scope, status: { in: ['DRAFT', 'READY', 'RELEASED', 'IN_PROGRESS'] } },
        include: {
          recycler: { select: { id: true, fullName: true, recyclerProfile: { select: { organizationName: true } } } },
          _count: { select: { batchItems: true, recoveredMaterials: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.inspection.findMany({
        where: scope,
        include: {
          item: { select: { id: true, itemCode: true, name: true } },
          inspectedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { inspectedAt: 'desc' },
        take: 8,
      }),
      (async () => {
        const [weight, batchesReady, recovery] = await Promise.all([
          prisma.inspection.aggregate({ where: scope, _sum: { actualWeightKg: true } }),
          prisma.processingBatch.count({ where: { ...scope, status: 'READY' } }),
          prisma.recoveredMaterial.aggregate({ where: { batch: scope }, _sum: { quantityKg: true } }),
        ]);
        return {
          inspectedWeightKg: Math.round(toNumber(weight._sum.actualWeightKg) * 1000) / 1000,
          batchesReadyToRelease: batchesReady,
          recoveredWeightKg: Math.round(toNumber(recovery._sum.quantityKg) * 1000) / 1000,
        };
      })(),
    ]);

  return {
    role: actor.role,
    center,
    itemsByStatus: itemsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    totalItemsAtCenter: itemsByStatus.reduce((sum, r) => sum + r._count._all, 0),
    pendingInspection,
    incomingPickups,
    openBatches,
    recentInspections,
    stats,
  };
}

export async function getRecyclerDashboard(actor: AuthUser) {
  if (!actor.recyclerProfileId) {
    throw new ForbiddenError('Your account has no recycler profile');
  }

  const batchWhere = batchAccessFilter(actor);

  const [profile, assignedBatches, recentRecoveries, stats, byMaterial] = await Promise.all([
    prisma.recyclerProfile.findUnique({
      where: { id: actor.recyclerProfileId },
      select: {
        id: true,
        organizationName: true,
        licenseNumber: true,
        acceptedMaterials: true,
        maxCapacityKg: true,
        isActive: true,
        contactPhone: true,
      },
    }),
    prisma.processingBatch.findMany({
      where: { AND: [batchWhere, { status: { in: ['RELEASED', 'IN_PROGRESS'] } }] },
      include: {
        center: { select: { id: true, name: true, code: true, city: true } },
        _count: { select: { batchItems: true } },
      },
      orderBy: [{ status: 'asc' }, { releasedAt: 'asc' }],
      take: 20,
    }),
    prisma.recoveredMaterial.findMany({
      where: recoveryAccessFilter(actor),
      include: {
        batch: { select: { id: true, batchCode: true, name: true } },
        item: { select: { id: true, itemCode: true, name: true } },
      },
      orderBy: { recordedAt: 'desc' },
      take: 10,
    }),
    (async () => {
      const [completed, inProgress, released, recovered, itemsProcessed] = await Promise.all([
        prisma.processingBatch.count({ where: { AND: [batchWhere, { status: 'COMPLETED' }] } }),
        prisma.processingBatch.count({ where: { AND: [batchWhere, { status: 'IN_PROGRESS' }] } }),
        prisma.processingBatch.count({ where: { AND: [batchWhere, { status: 'RELEASED' }] } }),
        prisma.recoveredMaterial.aggregate({
          where: recoveryAccessFilter(actor),
          _sum: { quantityKg: true },
          _avg: { purityPct: true },
        }),
        prisma.batchItem.count({ where: { batch: batchWhere } }),
      ]);
      return {
        completedBatches: completed,
        inProgressBatches: inProgress,
        awaitingStart: released,
        recoveredWeightKg: Math.round(toNumber(recovered._sum.quantityKg) * 1000) / 1000,
        averagePurityPct: recovered._avg.purityPct
          ? Math.round(toNumber(recovered._avg.purityPct) * 10) / 10
          : null,
        itemsProcessed,
      };
    })(),
    getMaterialRecovery(actor),
  ]);

  const activity = await prisma.statusHistory.findMany({
    where: { OR: [{ actorId: actor.id }, { batch: { recyclerId: actor.id } }] },
    include: { actor: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return {
    role: actor.role,
    profile,
    assignedBatches,
    recentRecoveries,
    stats,
    materialRecovery: byMaterial,
    recentActivity: activity,
  };
}

export async function getAdminDashboard(actor: AuthUser) {
  const [summary, usersByRole, unassignedPickups, batchesAwaitingRecycler, assignmentStats, centerPerf, activity, monthly] =
    await Promise.all([
      getSummary(actor),
      prisma.user.groupBy({ by: ['role', 'status'], _count: { _all: true } }),
      prisma.pickupRequest.count({ where: { status: { in: ['REQUESTED', 'FAILED'] } } }),
      prisma.processingBatch.count({ where: { status: 'READY', recyclerId: null } }),
      getAssignmentStats(),
      prisma.collectionCenter.count(),
      recentActivity(15),
      getMonthlyTrend(actor, 6),
    ]);

  const [attentionItems, categoryMix] = await Promise.all([
    Promise.all([
      prisma.pickupRequest.findMany({
        where: { status: { in: ['REQUESTED', 'FAILED'] } },
        select: {
          id: true,
          requestCode: true,
          status: true,
          city: true,
          preferredDate: true,
          failureReason: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 8,
      }),
      prisma.processingBatch.findMany({
        where: { status: 'READY', recyclerId: null },
        select: { id: true, batchCode: true, name: true, _count: { select: { batchItems: true } } },
        take: 8,
      }),
      prisma.ewasteItem.count({ where: { status: 'RECEIVED_AT_CENTER', inspection: null } }),
    ]).then(([pickups, batches, awaitingInspection]) => ({ pickups, batches, awaitingInspection })),
    getCategoryMix(actor, 6),
  ]);

  return {
    role: actor.role,
    summary,
    usersByRole: usersByRole.map((r) => ({ role: r.role, status: r.status, count: r._count._all })),
    collectionCenters: centerPerf,
    assignmentStats,
    needsAttention: {
      unassignedPickups,
      batchesAwaitingRecycler,
      awaitingInspectionItems: attentionItems.awaitingInspection,
      pickups: attentionItems.pickups,
      batches: attentionItems.batches,
    },
    recentActivity: activity,
    monthly,
    categoryMix,
  };
}

export async function getDashboard(actor: AuthUser) {
  switch (actor.role) {
    case 'ADMIN':
      return getAdminDashboard(actor);
    case 'COLLECTION_AGENT':
      return getAgentDashboard(actor);
    case 'CENTER_STAFF':
      return getCenterDashboard(actor);
    case 'RECYCLER':
      return getRecyclerDashboard(actor);
    case 'USER':
    default:
      return getUserDashboard(actor);
  }
}
