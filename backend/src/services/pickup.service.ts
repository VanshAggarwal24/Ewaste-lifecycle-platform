import type { PickupStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import { nextPickupRequestCode } from '../utils/ids';
import { assertTransition, allowedTransitions } from '../utils/statusMachine';
import { buildSearchFilter, dateRangeFilter, toNumber } from '../utils/queryFilters';
import { toUtcDate } from '../schemas/common.schema';
import type { CreatePickupInput } from '../schemas/workflow.schema';
import { recordHistory, recordHistoryForItems, pickupTimeline } from './history.service';

/**
 * Pickup request lifecycle: creation, agent actions, receipt at a centre, cancellation.
 *
 * Every mutation runs in a transaction that also writes the audit trail and keeps the
 * denormalised counters (`agent_profiles.current_load_count`) consistent.
 */

const PICKUP_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, phone: true, city: true } },
  agent: {
    select: {
      id: true,
      vehicleType: true,
      vehicleCapacityKg: true,
      isAvailable: true,
      ratingAvg: true,
      currentLoadCount: true,
      maxDailyPickups: true,
      user: { select: { id: true, fullName: true, email: true, phone: true } },
      center: { select: { id: true, name: true, code: true } },
    },
  },
  center: { select: { id: true, name: true, code: true, city: true } },
  category: { select: { id: true, name: true } },
} satisfies Prisma.PickupRequestInclude;

/** Row-level access rules per role, applied inside the query. */
export function pickupAccessFilter(actor: AuthUser): Prisma.PickupRequestWhereInput {
  switch (actor.role) {
    case 'ADMIN':
      return {};
    case 'USER':
      return { userId: actor.id };
    case 'COLLECTION_AGENT':
      return actor.agentProfileId
        ? { OR: [{ agentId: actor.agentProfileId }, { status: 'REQUESTED' }] }
        : { status: 'REQUESTED' };
    case 'CENTER_STAFF':
      return actor.staffedCenterId
        ? {
            OR: [
              { centerId: actor.staffedCenterId },
              { status: 'COLLECTED' }, // awaiting receipt, centre not yet recorded
            ],
          }
        : { status: 'COLLECTED' };
    case 'RECYCLER':
      // Recyclers see the pickups whose items ended up in their batches (read-only context).
      return { items: { some: { batchItem: { batch: { recyclerId: actor.id } } } } };
    default:
      return { id: -1 };
  }
}

export interface PickupListQuery {
  page: number;
  limit: number;
  status?: PickupStatus;
  agentId?: number;
  centerId?: number;
  userId?: number;
  city?: string;
  unassigned?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export async function listPickups(actor: AuthUser, query: PickupListQuery) {
  const where: Prisma.PickupRequestWhereInput = {
    AND: [
      pickupAccessFilter(actor),
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.agentId ? { agentId: query.agentId } : {}),
        ...(query.centerId ? { centerId: query.centerId } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
        ...(query.unassigned ? { agentId: null } : {}),
        ...(query.search
          ? { OR: buildSearchFilter(query.search, ['requestCode', 'addressLine', 'city']) }
          : {}),
        ...(dateRangeFilter(query.from, query.to) ? { preferredDate: dateRangeFilter(query.from, query.to) } : {}),
      },
    ],
  };

  const orderBy: Prisma.PickupRequestOrderByWithRelationInput =
    query.sortBy === 'preferredDate' ? { preferredDate: query.sortOrder } : { createdAt: query.sortOrder };

  const [requests, total] = await Promise.all([
    prisma.pickupRequest.findMany({
      where,
      include: {
        ...PICKUP_INCLUDE,
        items: {
          select: { id: true, itemCode: true, name: true, status: true, estimatedWeightKg: true, category: { select: { name: true } } },
        },
        _count: { select: { items: true, assignmentLogs: true } },
      },
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.pickupRequest.count({ where }),
  ]);

  return { requests, total };
}

export async function getPickup(actor: AuthUser, id: number) {
  const request = await prisma.pickupRequest.findFirst({
    where: { AND: [{ id }, pickupAccessFilter(actor)] },
    include: {
      ...PICKUP_INCLUDE,
      items: {
        include: {
          category: { select: { id: true, name: true, hazardLevel: true } },
          inspection: { select: { id: true, condition: true, qualityGrade: true, actualWeightKg: true, processingPath: true } },
          batchItem: { select: { batch: { select: { id: true, batchCode: true, name: true, status: true } } } },
        },
      },
      assignmentLogs: {
        orderBy: { createdAt: 'desc' },
        include: { assignedBy: { select: { id: true, fullName: true, role: true } } },
      },
    },
  });

  if (!request) throw new NotFoundError('Pickup request');
  return request;
}

export async function getPickupTimeline(actor: AuthUser, id: number) {
  await getPickup(actor, id);
  return pickupTimeline(id);
}

/**
 * Creates a pickup request for items the caller already submitted.
 *
 * Validation is transactional: it is not possible for two concurrent requests to claim the
 * same item, because the items are re-read inside the transaction and their status is
 * flipped to PICKUP_SCHEDULED there.
 */
export async function createPickup(actor: AuthUser, input: CreatePickupInput) {
  return prisma.$transaction(async (tx) => {
    const items = await tx.ewasteItem.findMany({
      where: { id: { in: input.itemIds } },
      select: { id: true, userId: true, status: true, itemCode: true, pickupRequestId: true, categoryId: true, estimatedWeightKg: true },
    });

    if (items.length !== input.itemIds.length) {
      const found = new Set(items.map((i) => i.id));
      const missing = input.itemIds.filter((id) => !found.has(id));
      throw new NotFoundError(`E-waste item(s) ${missing.join(', ')}`);
    }

    for (const item of items) {
      if (item.userId !== actor.id && actor.role !== 'ADMIN') {
        throw new ForbiddenError(`Item ${item.itemCode} does not belong to you`);
      }
      if (item.pickupRequestId) {
        throw new ConflictError(`Item ${item.itemCode} is already part of another pickup request`, {
          itemId: item.id,
          pickupRequestId: item.pickupRequestId,
        });
      }
      assertTransition('item', item.status, 'PICKUP_SCHEDULED', 'e-waste item');
    }

    const requestCode = await nextPickupRequestCode(tx);
    const distinctCategories = [...new Set(items.map((i) => i.categoryId))];
    const estimatedWeight =
      input.estimatedWeightKg ??
      (items.some((i) => i.estimatedWeightKg !== null)
        ? items.reduce((sum, i) => sum + toNumber(i.estimatedWeightKg), 0)
        : null);

    const request = await tx.pickupRequest.create({
      data: {
        requestCode,
        userId: actor.id,
        status: 'REQUESTED',
        addressLine: input.address.addressLine,
        city: input.address.city,
        state: input.address.state,
        pincode: input.address.pincode,
        latitude: input.address.latitude ?? null,
        longitude: input.address.longitude ?? null,
        preferredDate: toUtcDate(input.preferredDate),
        timeSlot: input.timeSlot ?? null,
        notes: input.notes ?? null,
        categoryId: input.categoryId ?? (distinctCategories.length === 1 ? distinctCategories[0] : null),
        estimatedWeightKg: estimatedWeight,
      },
      select: { id: true, requestCode: true, status: true },
    });

    await tx.ewasteItem.updateMany({
      where: { id: { in: input.itemIds } },
      data: { pickupRequestId: request.id, status: 'PICKUP_SCHEDULED' },
    });

    await recordHistory(tx, {
      entityType: 'PICKUP_REQUEST',
      pickupRequestId: request.id,
      status: 'REQUESTED',
      note: `Pickup requested for ${items.length} item(s), preferred date ${input.preferredDate}`,
      actor,
      metadata: { itemCodes: items.map((i) => i.itemCode), estimatedWeightKg: estimatedWeight },
    });

    await recordHistoryForItems(tx, input.itemIds, 'PICKUP_SCHEDULED', {
      note: `Scheduled for pickup ${request.requestCode}`,
      actor,
    });

    return request;
  });
}

/** Shared guard: only the agent the request is assigned to may act on it. */
async function loadAgentPickup(actor: AuthUser, id: number, action: string) {
  const request = await prisma.pickupRequest.findUnique({
    where: { id },
    select: { id: true, status: true, agentId: true, requestCode: true, userId: true, centerId: true, items: { select: { id: true, status: true } } },
  });

  if (!request) throw new NotFoundError('Pickup request');

  if (actor.role !== 'ADMIN') {
    if (!actor.agentProfileId || request.agentId !== actor.agentProfileId) {
      throw new ForbiddenError(`You may only ${action} pickups that are assigned to you`);
    }
  }

  return request;
}

/** Agent accepts the assignment. ASSIGNED -> ACCEPTED. */
export async function acceptPickup(actor: AuthUser, id: number) {
  const request = await loadAgentPickup(actor, id, 'accept');
  assertTransition('pickup', request.status, 'ACCEPTED', 'pickup request');

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.pickupRequest.update({
      where: { id },
      data: { status: 'ACCEPTED', acceptedAt: now },
      select: { id: true, requestCode: true, status: true, acceptedAt: true },
    });

    await recordHistory(tx, {
      entityType: 'PICKUP_REQUEST',
      pickupRequestId: id,
      status: 'ACCEPTED',
      note: 'Collection agent accepted the assignment',
      actor,
      at: now,
    });

    return updated;
  });
}

/**
 * Agent declines the assignment. ASSIGNED -> FAILED, and the agent slot is released so the
 * coordinator can reassign. The request keeps its history, so the decline is auditable.
 */
export async function declinePickup(actor: AuthUser, id: number, reason: string) {
  const request = await loadAgentPickup(actor, id, 'decline');
  assertTransition('pickup', request.status, 'FAILED', 'pickup request');

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.pickupRequest.update({
      where: { id },
      data: { status: 'FAILED', failureReason: reason, agentId: null },
      select: { id: true, requestCode: true, status: true, failureReason: true },
    });

    if (request.agentId) {
      await tx.$executeRaw`
        UPDATE "agent_profiles" SET current_load_count = GREATEST(current_load_count - 1, 0)
        WHERE id = ${request.agentId}`;
    }

    await recordHistory(tx, {
      entityType: 'PICKUP_REQUEST',
      pickupRequestId: id,
      status: 'FAILED',
      note: `Assignment declined by the agent: ${reason}. The request is available for reassignment.`,
      actor,
      at: now,
      metadata: { reason },
    });

    return updated;
  });
}

/** Agent records the physical collection. ACCEPTED -> COLLECTED. */
export async function collectPickup(
  actor: AuthUser,
  id: number,
  input: { collectedWeightKg?: number; notes?: string },
) {
  const request = await loadAgentPickup(actor, id, 'collect');
  assertTransition('pickup', request.status, 'COLLECTED', 'pickup request');

  const itemIds = request.items.map((i) => i.id);

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.pickupRequest.update({
      where: { id },
      data: {
        status: 'COLLECTED',
        collectedAt: now,
        collectedWeightKg: input.collectedWeightKg ?? null,
      },
      select: {
        id: true,
        requestCode: true,
        status: true,
        collectedAt: true,
        collectedWeightKg: true,
      },
    });

    // Items that were scheduled/collected move to COLLECTED exactly once.
    const toCollect = request.items.filter((i) => ['PICKUP_SCHEDULED', 'SUBMITTED', 'COLLECTED'].includes(i.status));
    if (toCollect.length > 0) {
      await tx.ewasteItem.updateMany({
        where: { id: { in: toCollect.map((i) => i.id) }, status: { in: ['PICKUP_SCHEDULED', 'SUBMITTED'] } },
        data: { status: 'COLLECTED' },
      });
      const actuallyChanged = toCollect.filter((i) => i.status !== 'COLLECTED').map((i) => i.id);
      if (actuallyChanged.length > 0) {
        await recordHistoryForItems(tx, actuallyChanged, 'COLLECTED', {
          note: `Collected by agent under pickup ${request.requestCode}`,
          actor,
          at: now,
        });
      }
    }

    // The agent's open-pickup counter is released once the job is physically done.
    if (request.agentId) {
      await tx.$executeRaw`
        UPDATE "agent_profiles" SET current_load_count = GREATEST(current_load_count - 1, 0)
        WHERE id = ${request.agentId}`;
    }

    await recordHistory(tx, {
      entityType: 'PICKUP_REQUEST',
      pickupRequestId: id,
      status: 'COLLECTED',
      note: input.notes
        ? `Items collected. ${input.notes}`
        : `Items collected from ${request.items.length} item(s)`,
      actor,
      at: now,
      metadata: { collectedWeightKg: input.collectedWeightKg ?? null, itemIds },
    });

    return updated;
  });
}

/** Agent reports a failed attempt. ASSIGNED/ACCEPTED/COLLECTED -> FAILED. */
export async function failPickup(actor: AuthUser, id: number, reason: string) {
  const request = await loadAgentPickup(actor, id, 'report a failure on');
  assertTransition('pickup', request.status, 'FAILED', 'pickup request');

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.pickupRequest.update({
      where: { id },
      data: { status: 'FAILED', failureReason: reason, agentId: null },
      select: { id: true, requestCode: true, status: true, failureReason: true },
    });

    if (request.agentId) {
      await tx.$executeRaw`
        UPDATE "agent_profiles" SET current_load_count = GREATEST(current_load_count - 1, 0)
        WHERE id = ${request.agentId}`;
    }

    await recordHistory(tx, {
      entityType: 'PICKUP_REQUEST',
      pickupRequestId: id,
      status: 'FAILED',
      note: `Pickup attempt failed: ${reason}`,
      actor,
      at: now,
      metadata: { reason },
    });

    return updated;
  });
}

/**
 * Centre staff confirm receipt of the collected items. COLLECTED -> RECEIVED_AT_CENTER.
 * From this point the items belong to a centre, which is what makes them eligible for
 * inspection.
 */
export async function receivePickup(
  actor: AuthUser,
  id: number,
  input: { centerId?: number; notes?: string },
) {
  if (actor.role !== 'CENTER_STAFF' && actor.role !== 'ADMIN') {
    throw new ForbiddenError('Only collection-centre staff can confirm receipt of items');
  }

  const centerId = input.centerId ?? actor.staffedCenterId ?? null;
  if (!centerId) {
    throw new ConflictError(
      'No collection centre specified. Either pass centerId or attach a centre to your staff account.',
    );
  }

  if (actor.role !== 'ADMIN' && actor.staffedCenterId && actor.staffedCenterId !== centerId) {
    throw new ForbiddenError('You may only receive items at the centre you are assigned to');
  }

  const request = await prisma.pickupRequest.findUnique({
    where: { id },
    select: { id: true, status: true, requestCode: true, items: { select: { id: true, status: true } } },
  });
  if (!request) throw new NotFoundError('Pickup request');

  assertTransition('pickup', request.status, 'RECEIVED_AT_CENTER', 'pickup request');

  const center = await prisma.collectionCenter.findUnique({ where: { id: centerId }, select: { id: true, name: true, status: true } });
  if (!center) throw new NotFoundError('Collection centre');
  if (center.status !== 'ACTIVE' && actor.role !== 'ADMIN') {
    throw new ConflictError(`Centre ${center.name} is ${center.status} and cannot receive items`);
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.pickupRequest.update({
      where: { id },
      data: { status: 'RECEIVED_AT_CENTER', receivedAt: now, centerId },
      select: { id: true, requestCode: true, status: true, receivedAt: true, centerId: true },
    });

    const toReceive = request.items.filter((i) => i.status === 'COLLECTED').map((i) => i.id);
    if (toReceive.length > 0) {
      await tx.ewasteItem.updateMany({
        where: { id: { in: toReceive } },
        data: { status: 'RECEIVED_AT_CENTER', centerId },
      });
      await recordHistoryForItems(tx, toReceive, 'RECEIVED_AT_CENTER', {
        note: `Received at ${center.name} (pickup ${request.requestCode})`,
        actor,
        at: now,
        metadata: { centerId },
      });
    }

    await recordHistory(tx, {
      entityType: 'PICKUP_REQUEST',
      pickupRequestId: id,
      status: 'RECEIVED_AT_CENTER',
      note: input.notes
        ? `Items received at ${center.name}. ${input.notes}`
        : `Items received at ${center.name}`,
      actor,
      at: now,
      metadata: { centerId, receivedItems: toReceive.length },
    });

    return updated;
  });
}

/** Owner (or admin) cancels a pickup that has not yet been collected. */
export async function cancelPickup(actor: AuthUser, id: number, reason?: string) {
  const request = await prisma.pickupRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      userId: true,
      requestCode: true,
      agentId: true,
      items: { select: { id: true, status: true } },
    },
  });
  if (!request) throw new NotFoundError('Pickup request');

  if (actor.role !== 'ADMIN' && request.userId !== actor.id) {
    throw new ForbiddenError('You may only cancel your own pickup requests');
  }

  assertTransition('pickup', request.status, 'CANCELLED', 'pickup request');

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.pickupRequest.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: now },
      select: { id: true, requestCode: true, status: true, cancelledAt: true },
    });

    // Items return to the user's shelf so they can raise a new request later.
    const revertable = request.items.filter((i) => i.status === 'PICKUP_SCHEDULED').map((i) => i.id);
    if (revertable.length > 0) {
      await tx.ewasteItem.updateMany({
        where: { id: { in: revertable } },
        data: { status: 'SUBMITTED' },
      });
      await recordHistoryForItems(tx, revertable, 'SUBMITTED', {
        note: `Pickup ${request.requestCode} was cancelled — the item is available for a new request`,
        actor,
        at: now,
      });
    }

    if (request.agentId) {
      await tx.$executeRaw`
        UPDATE "agent_profiles" SET current_load_count = GREATEST(current_load_count - 1, 0)
        WHERE id = ${request.agentId}`;
    }

    await recordHistory(tx, {
      entityType: 'PICKUP_REQUEST',
      pickupRequestId: id,
      status: 'CANCELLED',
      note: reason ? `Pickup cancelled: ${reason}` : 'Pickup cancelled by the requester',
      actor,
      at: now,
    });

    return updated;
  });
}

/** Data for the action buttons in the UI: which transitions this actor may trigger now. */
export function availableActions(actor: AuthUser, request: {
  status: PickupStatus;
  userId: number;
  agentId: number | null;
  centerId: number | null;
}) {
  const transitions = allowedTransitions('pickup', request.status);
  const isOwner = actor.id === request.userId;
  const isAssignedAgent = actor.agentProfileId !== null && request.agentId === actor.agentProfileId;
  const isStaff = actor.role === 'CENTER_STAFF' || actor.role === 'ADMIN';
  const isAdmin = actor.role === 'ADMIN';

  const actions: string[] = [];
  if (transitions.includes('ASSIGNED') && isStaff) actions.push('ASSIGN');
  if (transitions.includes('ACCEPTED') && (isAssignedAgent || isAdmin)) actions.push('ACCEPT');
  if (transitions.includes('COLLECTED') && (isAssignedAgent || isAdmin)) actions.push('COLLECT');
  if (transitions.includes('RECEIVED_AT_CENTER') && isStaff) actions.push('RECEIVE');
  if (transitions.includes('FAILED') && (isAssignedAgent || isAdmin)) actions.push('FAIL', 'DECLINE');
  if (transitions.includes('CANCELLED') && (isOwner || isAdmin)) actions.push('CANCEL');

  return {
    transitions,
    actions,
    isOwner,
    isAssignedAgent,
    canAssign: isStaff,
  };
}
