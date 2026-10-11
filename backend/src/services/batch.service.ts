import type { BatchStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import { nextBatchCode } from '../utils/ids';
import { assertTransition, allowedTransitions } from '../utils/statusMachine';
import { toNumber } from '../utils/queryFilters';
import type { CreateBatchInput } from '../schemas/workflow.schema';
import { recordHistory, recordHistoryForItems, batchTimeline } from './history.service';

/**
 * Processing batches: grouping inspected items into a shipment that a recycler processes.
 *
 * Status machine: DRAFT -> READY -> RELEASED -> IN_PROGRESS -> COMPLETED
 *
 * Item status follows the batch: adding an item makes it IN_BATCH, releasing the batch makes
 * the items PROCESSING, completing the batch makes them RECYCLED. Each change writes history
 * for both the item and the batch, so the timeline reads as one coherent story.
 */

const BATCH_INCLUDE = {
  center: { select: { id: true, name: true, code: true, city: true } },
  recycler: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      recyclerProfile: { select: { id: true, organizationName: true, licenseNumber: true } },
    },
  },
  createdBy: { select: { id: true, fullName: true, role: true } },
} satisfies Prisma.ProcessingBatchInclude;

export function batchAccessFilter(actor: AuthUser): Prisma.ProcessingBatchWhereInput {
  switch (actor.role) {
    case 'ADMIN':
      return {};
    case 'CENTER_STAFF':
      return actor.staffedCenterId ? { centerId: actor.staffedCenterId } : { id: -1 };
    case 'RECYCLER':
      return { recyclerId: actor.id };
    case 'USER':
      return { batchItems: { some: { item: { userId: actor.id } } } };
    case 'COLLECTION_AGENT':
      return actor.agentProfileId
        ? { batchItems: { some: { item: { pickupRequest: { agentId: actor.agentProfileId } } } } }
        : { id: -1 };
    default:
      return { id: -1 };
  }
}

export interface BatchListQuery {
  page: number;
  limit: number;
  status?: BatchStatus;
  centerId?: number;
  recyclerId?: number;
  unassigned?: boolean;
  search?: string;
  sortOrder: 'asc' | 'desc';
}

export async function listBatches(actor: AuthUser, query: BatchListQuery) {
  const where: Prisma.ProcessingBatchWhereInput = {
    AND: [
      batchAccessFilter(actor),
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.centerId ? { centerId: query.centerId } : {}),
        ...(query.recyclerId ? { recyclerId: query.recyclerId } : {}),
        ...(query.unassigned ? { recyclerId: null } : {}),
        ...(query.search
          ? {
              OR: [
                { batchCode: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    ],
  };

  const [batches, total] = await Promise.all([
    prisma.processingBatch.findMany({
      where,
      include: {
        ...BATCH_INCLUDE,
        batchItems: {
          select: {
            id: true,
            item: { select: { id: true, itemCode: true, name: true, status: true, inspection: { select: { actualWeightKg: true, qualityGrade: true } } } },
          },
        },
        recoveredMaterials: { select: { id: true, materialType: true, quantityKg: true } },
        _count: { select: { batchItems: true, recoveredMaterials: true } },
      },
      orderBy: { createdAt: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.processingBatch.count({ where }),
  ]);

  // Derived totals are computed here so every client sees the same numbers.
  const enriched = batches.map((batch) => {
    const itemWeightKg = batch.batchItems.reduce(
      (sum, bi) => sum + toNumber(bi.item.inspection?.actualWeightKg),
      0,
    );
    const recoveredWeightKg = batch.recoveredMaterials.reduce((sum, rm) => sum + toNumber(rm.quantityKg), 0);
    return {
      ...batch,
      itemCount: batch._count.batchItems,
      itemWeightKg: Math.round(itemWeightKg * 1000) / 1000,
      recoveredWeightKg: Math.round(recoveredWeightKg * 1000) / 1000,
      recoveryRatePct: itemWeightKg > 0 ? Math.round((recoveredWeightKg / itemWeightKg) * 1000) / 10 : null,
    };
  });

  return { batches: enriched, total };
}

export async function getBatch(actor: AuthUser, id: number) {
  const batch = await prisma.processingBatch.findFirst({
    where: { AND: [{ id }, batchAccessFilter(actor)] },
    include: {
      ...BATCH_INCLUDE,
      batchItems: {
        include: {
          item: {
            include: {
              category: { select: { id: true, name: true, hazardLevel: true } },
              inspection: true,
              user: { select: { id: true, fullName: true } },
            },
          },
        },
        orderBy: { addedAt: 'asc' },
      },
      recoveredMaterials: {
        include: {
          recordedBy: { select: { id: true, fullName: true, role: true } },
          item: { select: { id: true, itemCode: true, name: true } },
        },
        orderBy: { recordedAt: 'asc' },
      },
    },
  });

  if (!batch) throw new NotFoundError('Processing batch');

  const itemWeightKg = batch.batchItems.reduce(
    (sum, bi) => sum + toNumber(bi.item.inspection?.actualWeightKg),
    0,
  );
  const recoveredWeightKg = batch.recoveredMaterials.reduce((sum, rm) => sum + toNumber(rm.quantityKg), 0);
  const recoveredValue = batch.recoveredMaterials.reduce(
    (sum, rm) => sum + toNumber(rm.quantityKg) * toNumber(rm.marketValuePerKg),
    0,
  );

  return {
    ...batch,
    itemCount: batch.batchItems.length,
    itemWeightKg: Math.round(itemWeightKg * 1000) / 1000,
    recoveredWeightKg: Math.round(recoveredWeightKg * 1000) / 1000,
    recoveredValue: Math.round(recoveredValue * 100) / 100,
    recoveryRatePct: itemWeightKg > 0 ? Math.round((recoveredWeightKg / itemWeightKg) * 1000) / 10 : null,
  };
}

export async function getBatchTimeline(actor: AuthUser, id: number) {
  await getBatch(actor, id);
  return batchTimeline(id);
}

/** Items that may legally be added to a batch: inspected, at this centre, not yet batched. */
export async function listBatchableItems(actor: AuthUser, options: { centerId?: number; processingPath?: string } = {}) {
  const centerId = options.centerId ?? actor.staffedCenterId ?? null;
  if (!centerId && actor.role !== 'ADMIN') {
    throw new ForbiddenError('Your staff account is not attached to a collection centre');
  }

  return prisma.ewasteItem.findMany({
    where: {
      status: 'INSPECTED',
      batchItem: null,
      ...(actor.role === 'ADMIN' && !centerId ? {} : { centerId }),
      ...(options.processingPath ? { inspection: { processingPath: options.processingPath as never } } : {}),
    },
    include: {
      category: { select: { id: true, name: true, hazardLevel: true } },
      inspection: { select: { condition: true, qualityGrade: true, actualWeightKg: true, processingPath: true, hazardFlag: true } },
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { updatedAt: 'asc' },
    take: 200,
  });
}

export async function createBatch(actor: AuthUser, input: CreateBatchInput) {
  if (actor.role !== 'CENTER_STAFF' && actor.role !== 'ADMIN') {
    throw new ForbiddenError('Only collection-centre staff can create processing batches');
  }

  const centerId = input.centerId ?? actor.staffedCenterId ?? null;
  if (!centerId) {
    throw new ConflictError('A collection centre is required to create a batch');
  }
  if (actor.role === 'CENTER_STAFF' && actor.staffedCenterId && actor.staffedCenterId !== centerId) {
    throw new ForbiddenError('You may only create batches for your own centre');
  }

  const center = await prisma.collectionCenter.findUnique({ where: { id: centerId }, select: { id: true, name: true } });
  if (!center) throw new NotFoundError('Collection centre');

  return prisma.$transaction(async (tx) => {
    const batchCode = await nextBatchCode(tx);

    const batch = await tx.processingBatch.create({
      data: {
        batchCode,
        centerId,
        createdById: actor.id,
        name: input.name,
        status: 'DRAFT',
        processingPath: input.processingPath ?? null,
        targetWeightKg: input.targetWeightKg ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true, batchCode: true, name: true, status: true },
    });

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId: batch.id,
      status: 'DRAFT',
      note: `Batch ${batch.batchCode} created at ${center.name}`,
      actor,
      metadata: { centerId },
    });

    if (input.itemIds && input.itemIds.length > 0) {
      await addItemsToBatchInternal(actor, tx, batch.id, input.itemIds, centerId);
    }

    return batch;
  });
}

/** Public wrapper: adds items to an existing batch. */
export async function addItemsToBatch(actor: AuthUser, batchId: number, itemIds: number[]) {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, centerId: true, batchCode: true },
  });
  if (!batch) throw new NotFoundError('Processing batch');
  assertBatchEditableByStaff(actor, batch.centerId);

  if (!['DRAFT', 'READY'].includes(batch.status)) {
    throw new ConflictError(`Items can only be added while the batch is DRAFT or READY (current: ${batch.status})`);
  }

  return prisma.$transaction(async (tx) => {
    const result = await addItemsToBatchInternal(actor, tx, batchId, itemIds, batch.centerId);
    return { batchId, added: result.added, items: result.items };
  });
}

/**
 * Core add-items routine. Runs inside a caller-provided transaction so it can be reused by
 * batch creation without nesting transactions.
 */
async function addItemsToBatchInternal(
  actor: AuthUser,
  tx: Prisma.TransactionClient,
  batchId: number,
  itemIds: number[],
  centerId: number,
) {
  const items = await tx.ewasteItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      itemCode: true,
      status: true,
      centerId: true,
      batchItem: { select: { id: true, batchId: true } },
      inspection: { select: { id: true, actualWeightKg: true } },
    },
  });

  if (items.length !== itemIds.length) {
    const found = new Set(items.map((i) => i.id));
    const missing = itemIds.filter((id) => !found.has(id));
    throw new NotFoundError(`E-waste item(s) ${missing.join(', ')}`);
  }

  const added: number[] = [];
  for (const item of items) {
    if (item.batchItem) {
      throw new ConflictError(
        `Item ${item.itemCode} is already part of batch #${item.batchItem.batchId}. An item can only ever belong to one batch.`,
        { itemId: item.id, existingBatchId: item.batchItem.batchId },
      );
    }
    if (item.status !== 'INSPECTED') {
      throw new ConflictError(
        `Item ${item.itemCode} is in status ${item.status}; only INSPECTED items can be batched`,
      );
    }
    if (!item.inspection) {
      throw new ConflictError(`Item ${item.itemCode} has no inspection record and cannot be batched`);
    }
    if (item.centerId !== centerId) {
      throw new ConflictError(
        `Item ${item.itemCode} is not located at this collection centre and cannot be added to the batch`,
      );
    }

    await tx.batchItem.create({
      data: {
        batchId,
        itemId: item.id,
        addedById: actor.id,
        weightAtAdditionKg: item.inspection.actualWeightKg,
      },
    });

    await tx.ewasteItem.update({ where: { id: item.id }, data: { status: 'IN_BATCH' } });

    await recordHistory(tx, {
      entityType: 'EWASTE_ITEM',
      itemId: item.id,
      status: 'IN_BATCH',
      note: `Added to processing batch #${batchId}`,
      actor,
      metadata: { batchId },
    });

    added.push(item.id);
  }

  if (added.length > 0) {
    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId,
      status: 'DRAFT',
      note: `${added.length} item(s) added to the batch`,
      actor,
      metadata: { itemIds: added },
    });
  }

  // Keep the declared target weight in sync with the measured weight when the operator has
  // not set one explicitly.
  const aggregate = await tx.batchItem.aggregate({
    where: { batchId },
    _sum: { weightAtAdditionKg: true },
  });
  await tx.processingBatch.update({
    where: { id: batchId },
    data: {
      targetWeightKg: aggregate._sum.weightAtAdditionKg ?? undefined,
      actualWeightKg: aggregate._sum.weightAtAdditionKg ?? undefined,
    },
  });

  return { added: added.length, items: items.map((i) => ({ id: i.id, itemCode: i.itemCode })) };
}

/** Removes an item from a batch that has not been released yet. */
export async function removeItemFromBatch(actor: AuthUser, batchId: number, itemId: number) {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, centerId: true, batchCode: true },
  });
  if (!batch) throw new NotFoundError('Processing batch');
  assertBatchEditableByStaff(actor, batch.centerId);

  if (!['DRAFT', 'READY'].includes(batch.status)) {
    throw new ConflictError(
      `Items cannot be removed from a batch in status ${batch.status}; the batch has already been released to a recycler`,
    );
  }

  const batchItem = await prisma.batchItem.findFirst({
    where: { batchId, itemId },
    select: { id: true, item: { select: { id: true, itemCode: true, status: true } } },
  });
  if (!batchItem) throw new NotFoundError('Batch item');

  return prisma.$transaction(async (tx) => {
    await tx.batchItem.delete({ where: { id: batchItem.id } });
    await tx.ewasteItem.update({ where: { id: itemId }, data: { status: 'INSPECTED' } });

    await recordHistory(tx, {
      entityType: 'EWASTE_ITEM',
      itemId,
      status: 'INSPECTED',
      note: `Removed from processing batch ${batch.batchCode} — the item is available for a different batch`,
      actor,
    });

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId,
      status: batch.status,
      note: `Item ${batchItem.item.itemCode} removed from the batch`,
      actor,
      metadata: { itemId },
    });

    const aggregate = await tx.batchItem.aggregate({ where: { batchId }, _sum: { weightAtAdditionKg: true } });
    await tx.processingBatch.update({
      where: { id: batchId },
      data: {
        targetWeightKg: aggregate._sum.weightAtAdditionKg ?? null,
        actualWeightKg: aggregate._sum.weightAtAdditionKg ?? null,
      },
    });

    return { message: `Item removed from batch`, itemId, batchId };
  });
}

export async function updateBatch(
  actor: AuthUser,
  batchId: number,
  input: { name?: string; processingPath?: never; targetWeightKg?: number | null; notes?: string | null },
) {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, centerId: true },
  });
  if (!batch) throw new NotFoundError('Processing batch');
  assertBatchEditableByStaff(actor, batch.centerId);

  if (['RELEASED', 'IN_PROGRESS', 'COMPLETED'].includes(batch.status)) {
    throw new ConflictError(`A batch in status ${batch.status} is locked and cannot be edited`);
  }

  return prisma.processingBatch.update({
    where: { id: batchId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.processingPath !== undefined ? { processingPath: input.processingPath } : {}),
      ...(input.targetWeightKg !== undefined ? { targetWeightKg: input.targetWeightKg } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    select: { id: true, batchCode: true, name: true, status: true, targetWeightKg: true, notes: true },
  });
}

/** DRAFT -> READY. Requires at least one item. */
export async function markBatchReady(actor: AuthUser, batchId: number) {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, centerId: true, batchCode: true, _count: { select: { batchItems: true } } },
  });
  if (!batch) throw new NotFoundError('Processing batch');
  assertBatchEditableByStaff(actor, batch.centerId);
  assertTransition('batch', batch.status, 'READY', 'processing batch');

  if (batch._count.batchItems === 0) {
    throw new ConflictError('A batch must contain at least one item before it can be marked ready', {
      batchId,
    });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.processingBatch.update({
      where: { id: batchId },
      data: { status: 'READY' },
      select: { id: true, batchCode: true, status: true },
    });

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId,
      status: 'READY',
      note: `Batch sealed with ${batch._count.batchItems} item(s) and ready for release to a recycler`,
      actor,
    });

    return updated;
  });
}

/** Assigns (or changes) the recycler that will process the batch. */
export async function assignRecycler(
  actor: AuthUser,
  batchId: number,
  recyclerUserId: number,
  notes?: string,
) {
  if (actor.role !== 'ADMIN' && actor.role !== 'CENTER_STAFF') {
    throw new ForbiddenError('Only administrators or centre staff can assign a recycler');
  }

  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, centerId: true, batchCode: true, recyclerId: true },
  });
  if (!batch) throw new NotFoundError('Processing batch');
  assertBatchEditableByStaff(actor, batch.centerId);

  if (batch.status === 'COMPLETED') {
    throw new ConflictError('A completed batch can no longer be reassigned');
  }
  if (batch.recyclerId === recyclerUserId) {
    throw new ConflictError('This batch is already assigned to the selected recycler');
  }

  const recycler = await prisma.user.findFirst({
    where: { id: recyclerUserId, role: 'RECYCLER' },
    select: {
      id: true,
      fullName: true,
      status: true,
      recyclerProfile: { select: { id: true, organizationName: true, isActive: true } },
    },
  });
  if (!recycler) throw new NotFoundError('Recycler');
  if (recycler.status !== 'ACTIVE') throw new ConflictError('The selected recycler account is not active');
  if (!recycler.recyclerProfile) throw new ConflictError('The selected user has no recycler profile');
  if (!recycler.recyclerProfile.isActive) throw new ConflictError('The selected recycler is not accepting new batches');

  return prisma.$transaction(async (tx) => {
    // If the batch was already released to a different recycler, it returns to READY so the
    // new release is an explicit, auditable action rather than a silent swap.
    const returnsToReady = batch.status === 'RELEASED';
    if (['RELEASED', 'IN_PROGRESS'].includes(batch.status)) {
      const existingItems = await tx.batchItem.findMany({ where: { batchId }, select: { itemId: true } });
      const itemIds = existingItems.map((bi) => bi.itemId);
      if (itemIds.length > 0) {
        await tx.ewasteItem.updateMany({ where: { id: { in: itemIds } }, data: { status: 'IN_BATCH' } });
        await recordHistoryForItems(tx, itemIds, 'IN_BATCH', {
          note: `Batch ${batch.batchCode} reassigned — items returned to the centre batch holding area`,
          actor,
        });
      }
      const recoveries = await tx.recoveredMaterial.count({ where: { batchId } });
      if (recoveries > 0) {
        throw new ConflictError(
          'This batch already has material-recovery records and cannot be reassigned to another recycler',
          { recoveryRecords: recoveries },
        );
      }
    }

    const updated = await tx.processingBatch.update({
      where: { id: batchId },
      data: {
        recyclerId: recyclerUserId,
        ...(returnsToReady ? { status: 'READY' as BatchStatus, releasedAt: null, startedAt: null } : {}),
      },
      select: { id: true, batchCode: true, status: true, recyclerId: true },
    });

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId,
      status: updated.status,
      note: `Recycler assigned: ${recycler.recyclerProfile?.organizationName ?? recycler.fullName}${notes ? ` — ${notes}` : ''}`,
      actor,
      metadata: { recyclerUserId, organizationName: recycler.recyclerProfile?.organizationName ?? null },
    });

    return updated;
  });
}

/** READY -> RELEASED. Requires a recycler; moves every item to PROCESSING. */
export async function releaseBatch(actor: AuthUser, batchId: number, input: { recyclerId?: number; notes?: string } = {}) {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      status: true,
      centerId: true,
      batchCode: true,
      recyclerId: true,
      center: { select: { name: true } },
      recycler: { select: { id: true, fullName: true } },
      _count: { select: { batchItems: true } },
    },
  });
  if (!batch) throw new NotFoundError('Processing batch');
  assertBatchEditableByStaff(actor, batch.centerId);

  const recyclerId = input.recyclerId ?? batch.recyclerId;
  if (!recyclerId) {
    throw new ConflictError(
      'Assign a recycler before releasing the batch. Use POST /api/batches/{id}/recycler or pass recyclerId to this endpoint.',
    );
  }

  if (input.recyclerId && input.recyclerId !== batch.recyclerId) {
    // Persist the choice first (it also validates the recycler).
    await assignRecycler(actor, batchId, input.recyclerId, input.notes);
  }

  const fresh = await prisma.processingBatch.findUniqueOrThrow({
    where: { id: batchId },
    select: { status: true, recyclerId: true, _count: { select: { batchItems: true } } },
  });

  assertTransition('batch', fresh.status, 'RELEASED', 'processing batch');

  if (fresh._count.batchItems === 0) {
    throw new ConflictError('An empty batch cannot be released');
  }

  const recycler = await prisma.user.findUniqueOrThrow({
    where: { id: fresh.recyclerId as number },
    select: { id: true, fullName: true, recyclerProfile: { select: { organizationName: true } } },
  });

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.processingBatch.update({
      where: { id: batchId },
      data: { status: 'RELEASED', releasedAt: now },
      select: { id: true, batchCode: true, status: true, releasedAt: true, recyclerId: true },
    });

    const batchItems = await tx.batchItem.findMany({ where: { batchId }, select: { itemId: true } });
    const itemIds = batchItems.map((bi) => bi.itemId);

    if (itemIds.length > 0) {
      await tx.ewasteItem.updateMany({ where: { id: { in: itemIds } }, data: { status: 'PROCESSING' } });
      await recordHistoryForItems(tx, itemIds, 'PROCESSING', {
        note: `Released for processing in batch ${batch.batchCode} to ${recycler.recyclerProfile?.organizationName ?? recycler.fullName}`,
        actor,
        at: now,
        metadata: { batchId },
      });
    }

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId,
      status: 'RELEASED',
      note: `Batch released from ${batch.center.name} to ${recycler.recyclerProfile?.organizationName ?? recycler.fullName} (${itemIds.length} item(s))`,
      actor,
      at: now,
      metadata: { recyclerUserId: recycler.id, itemCount: itemIds.length },
    });

    return updated;
  });
}

/** RELEASED -> IN_PROGRESS, performed by the assigned recycler. */
export async function startBatch(actor: AuthUser, batchId: number) {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, batchCode: true, recyclerId: true, _count: { select: { batchItems: true } } },
  });
  if (!batch) throw new NotFoundError('Processing batch');

  if (actor.role !== 'ADMIN' && batch.recyclerId !== actor.id) {
    throw new ForbiddenError('Only the assigned recycler can start processing this batch');
  }

  assertTransition('batch', batch.status, 'IN_PROGRESS', 'processing batch');

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.processingBatch.update({
      where: { id: batchId },
      data: { status: 'IN_PROGRESS', startedAt: now },
      select: { id: true, batchCode: true, status: true, startedAt: true },
    });

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId,
      status: 'IN_PROGRESS',
      note: `Processing started on ${batch._count.batchItems} item(s)`,
      actor,
      at: now,
    });

    return updated;
  });
}

/**
 * IN_PROGRESS -> COMPLETED, performed by the assigned recycler.
 * Requires at least one material-recovery record, otherwise the batch would claim to be
 * processed with no evidence of what was recovered — the same rule that prevents "empty"
 * recycling claims in the real world.
 */
export async function completeBatch(
  actor: AuthUser,
  batchId: number,
  input: { actualWeightKg?: number; notes?: string },
) {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      status: true,
      batchCode: true,
      recyclerId: true,
      centerId: true,
      _count: { select: { batchItems: true, recoveredMaterials: true } },
    },
  });
  if (!batch) throw new NotFoundError('Processing batch');

  if (actor.role !== 'ADMIN' && batch.recyclerId !== actor.id) {
    throw new ForbiddenError('Only the assigned recycler can complete this batch');
  }

  assertTransition('batch', batch.status, 'COMPLETED', 'processing batch');

  if (batch._count.recoveredMaterials === 0) {
    throw new ConflictError(
      'Record at least one recovered material before completing the batch — a completed batch must state what was recovered',
    );
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.processingBatch.update({
      where: { id: batchId },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        ...(input.actualWeightKg !== undefined ? { actualWeightKg: input.actualWeightKg } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      select: { id: true, batchCode: true, status: true, completedAt: true },
    });

    const batchItems = await tx.batchItem.findMany({ where: { batchId }, select: { itemId: true } });
    const itemIds = batchItems.map((bi) => bi.itemId);

    if (itemIds.length > 0) {
      await tx.ewasteItem.updateMany({ where: { id: { in: itemIds } }, data: { status: 'RECYCLED' } });
      await recordHistoryForItems(tx, itemIds, 'RECYCLED', {
        note: `Recycling completed in batch ${batch.batchCode}`,
        actor,
        at: now,
        metadata: { batchId },
      });
    }

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId,
      status: 'COMPLETED',
      note: `Batch completed with ${batch._count.recoveredMaterials} recovered-material record(s)`,
      actor,
      at: now,
      metadata: { recoveredMaterialRecords: batch._count.recoveredMaterials },
    });

    return updated;
  });
}

/** Deletes an untouched DRAFT batch, returning its items to INSPECTED. */
export async function deleteBatch(actor: AuthUser, batchId: number) {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, centerId: true, batchCode: true, _count: { select: { recoveredMaterials: true } } },
  });
  if (!batch) throw new NotFoundError('Processing batch');
  assertBatchEditableByStaff(actor, batch.centerId);

  if (batch.status !== 'DRAFT' || batch._count.recoveredMaterials > 0) {
    throw new ConflictError(
      `Only an untouched DRAFT batch can be deleted (current status: ${batch.status}). Remove its items and keep the record instead.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const batchItems = await tx.batchItem.findMany({ where: { batchId }, select: { itemId: true } });
    const itemIds = batchItems.map((bi) => bi.itemId);

    await tx.batchItem.deleteMany({ where: { batchId } });
    if (itemIds.length > 0) {
      await tx.ewasteItem.updateMany({ where: { id: { in: itemIds } }, data: { status: 'INSPECTED' } });
    }
    await tx.processingBatch.delete({ where: { id: batchId } });

    return { message: 'Batch deleted', batchId, releasedItems: itemIds.length };
  });
}

/** Batch lifecycle state for the UI action bar. */
export function batchActions(actor: AuthUser, batch: { status: BatchStatus; centerId: number; recyclerId: number | null }) {
  const transitions = allowedTransitions('batch', batch.status);
  const isStaff = actor.role === 'ADMIN' || (actor.role === 'CENTER_STAFF' && actor.staffedCenterId === batch.centerId);
  const isAssignedRecycler = actor.role === 'RECYCLER' && batch.recyclerId === actor.id;

  const actions: string[] = [];
  if (isStaff) {
    if (transitions.includes('READY')) actions.push('MARK_READY');
    if (transitions.includes('RELEASED')) actions.push('RELEASE');
    if (['DRAFT', 'READY'].includes(batch.status)) actions.push('ADD_ITEMS', 'REMOVE_ITEMS', 'EDIT');
    if (batch.status === 'DRAFT') actions.push('DELETE');
    if (['DRAFT', 'READY', 'RELEASED'].includes(batch.status)) actions.push('ASSIGN_RECYCLER');
  }
  if (isAssignedRecycler || actor.role === 'ADMIN') {
    if (transitions.includes('IN_PROGRESS')) actions.push('START');
    if (transitions.includes('COMPLETED')) actions.push('COMPLETE');
    if (batch.status === 'IN_PROGRESS') actions.push('RECORD_RECOVERY');
  }

  return { transitions, actions, isStaff, isAssignedRecycler };
}

function assertBatchEditableByStaff(actor: AuthUser, centerId: number) {
  if (actor.role === 'ADMIN') return;
  if (actor.role !== 'CENTER_STAFF') {
    throw new ForbiddenError('Only collection-centre staff can manage processing batches');
  }
  if (actor.staffedCenterId && actor.staffedCenterId !== centerId) {
    throw new ForbiddenError('You may only manage batches belonging to your own centre');
  }
}
