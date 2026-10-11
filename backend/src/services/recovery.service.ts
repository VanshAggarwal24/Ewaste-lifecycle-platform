import type { MaterialType, Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import { dateRangeFilter, toNumber } from '../utils/queryFilters';
import type { CreateRecoveryInput } from '../schemas/workflow.schema';
import { recordHistory } from './history.service';

/**
 * Material recovery: what a recycler actually got out of a batch.
 *
 * Two rules carry most of the weight here:
 *  1. UNIQUE(batch_id, material_type) — a batch reports each material once, so quantities
 *     cannot be double-counted by adding two copper rows.
 *  2. Records are immutable once the batch is COMPLETED — recovery figures are the outcome
 *     the whole platform reports on, so they must not be edited after the fact.
 */

const RECOVERY_INCLUDE = {
  batch: {
    select: {
      id: true,
      batchCode: true,
      name: true,
      status: true,
      centerId: true,
      recyclerId: true,
      center: { select: { id: true, name: true, code: true } },
    },
  },
  recordedBy: { select: { id: true, fullName: true, role: true } },
  item: { select: { id: true, itemCode: true, name: true } },
} satisfies Prisma.RecoveredMaterialInclude;

export function recoveryAccessFilter(actor: AuthUser): Prisma.RecoveredMaterialWhereInput {
  switch (actor.role) {
    case 'ADMIN':
      return {};
    case 'RECYCLER':
      return { batch: { recyclerId: actor.id } };
    case 'CENTER_STAFF':
      return actor.staffedCenterId ? { batch: { centerId: actor.staffedCenterId } } : { id: -1 };
    case 'USER':
      return { item: { userId: actor.id } };
    case 'COLLECTION_AGENT':
      return actor.agentProfileId
        ? { item: { pickupRequest: { agentId: actor.agentProfileId } } }
        : { id: -1 };
    default:
      return { id: -1 };
  }
}

export interface RecoveryListQuery {
  page: number;
  limit: number;
  batchId?: number;
  materialType?: MaterialType;
  search?: string;
  sortOrder: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export async function listRecoveries(actor: AuthUser, query: RecoveryListQuery) {
  const where: Prisma.RecoveredMaterialWhereInput = {
    AND: [
      recoveryAccessFilter(actor),
      {
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.materialType ? { materialType: query.materialType } : {}),
        ...(dateRangeFilter(query.from, query.to) ? { recordedAt: dateRangeFilter(query.from, query.to) } : {}),
        ...(query.search
          ? { batch: { OR: [{ batchCode: { contains: query.search, mode: 'insensitive' } },
                             { name: { contains: query.search, mode: 'insensitive' } }] } }
          : {}),
      },
    ],
  };

  const [recoveries, total, totals] = await Promise.all([
    prisma.recoveredMaterial.findMany({
      where,
      include: RECOVERY_INCLUDE,
      orderBy: { recordedAt: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.recoveredMaterial.count({ where }),
    prisma.recoveredMaterial.aggregate({ where, _sum: { quantityKg: true } }),
  ]);

  return {
    recoveries,
    total,
    totalQuantityKg: toNumber(totals._sum.quantityKg),
  };
}

/** Loads a batch and asserts the caller is allowed to write recovery records for it. */
async function loadBatchForRecovery(actor: AuthUser, batchId: number) {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      batchCode: true,
      name: true,
      status: true,
      centerId: true,
      recyclerId: true,
      recycler: { select: { id: true, fullName: true } },
      batchItems: { select: { itemId: true } },
    },
  });

  if (!batch) throw new NotFoundError('Processing batch');

  if (actor.role !== 'ADMIN' && batch.recyclerId !== actor.id) {
    throw new ForbiddenError('Only the recycler this batch is assigned to can record its outcomes');
  }

  return batch;
}

export async function createRecovery(actor: AuthUser, batchId: number, input: CreateRecoveryInput) {
  if (actor.role !== 'RECYCLER' && actor.role !== 'ADMIN') {
    throw new ForbiddenError('Only recyclers can record recovered materials');
  }

  const batch = await loadBatchForRecovery(actor, batchId);

  if (batch.status !== 'IN_PROGRESS') {
    throw new ConflictError(
      `Recovered materials can only be recorded while the batch is IN_PROGRESS (current status: ${batch.status}). Start processing first.`,
      { currentStatus: batch.status },
    );
  }

  const itemIds = new Set(batch.batchItems.map((bi) => bi.itemId));
  if (input.itemId !== undefined && !itemIds.has(input.itemId)) {
    throw new ConflictError('The referenced item is not part of this batch', { itemId: input.itemId });
  }

  // Explicit pre-check so the client receives a domain message rather than a raw P2002.
  const duplicate = await prisma.recoveredMaterial.findFirst({
    where: { batchId, materialType: input.materialType },
    select: { id: true, quantityKg: true },
  });
  if (duplicate) {
    throw new ConflictError(
      `${input.materialType} has already been recorded for batch ${batch.batchCode}. Update that record instead of adding a second one.`,
      { existingRecoveryId: duplicate.id, existingQuantityKg: toNumber(duplicate.quantityKg) },
    );
  }

  return prisma.$transaction(async (tx) => {
    const recovery = await tx.recoveredMaterial.create({
      data: {
        batchId,
        itemId: input.itemId ?? null,
        recordedById: actor.id,
        materialType: input.materialType,
        quantityKg: input.quantityKg,
        unit: input.unit,
        purityPct: input.purityPct ?? null,
        marketValuePerKg: input.marketValuePerKg ?? null,
        notes: input.notes ?? null,
      },
      include: RECOVERY_INCLUDE,
    });

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId,
      status: batch.status,
      note: `Recovered ${input.quantityKg} kg of ${input.materialType}${input.purityPct ? ` at ${input.purityPct}% purity` : ''}`,
      actor,
      metadata: {
        recoveryId: recovery.id,
        materialType: input.materialType,
        quantityKg: input.quantityKg,
      },
    });

    return recovery;
  });
}

export async function updateRecovery(
  actor: AuthUser,
  recoveryId: number,
  input: { quantityKg?: number; purityPct?: number | null; marketValuePerKg?: number | null; notes?: string | null },
) {
  const recovery = await prisma.recoveredMaterial.findUnique({
    where: { id: recoveryId },
    select: { id: true, batchId: true, materialType: true, batch: { select: { status: true, recyclerId: true, batchCode: true } } },
  });
  if (!recovery) throw new NotFoundError('Recovery record');

  if (actor.role !== 'ADMIN' && recovery.batch.recyclerId !== actor.id) {
    throw new ForbiddenError('Only the recycler this batch is assigned to can update its recovery records');
  }

  if (recovery.batch.status === 'COMPLETED' && actor.role !== 'ADMIN') {
    throw new ConflictError(
      'This batch is completed and its recovery figures are final. Contact an administrator if a correction is required.',
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.recoveredMaterial.update({
      where: { id: recoveryId },
      data: {
        ...(input.quantityKg !== undefined ? { quantityKg: input.quantityKg } : {}),
        ...(input.purityPct !== undefined ? { purityPct: input.purityPct } : {}),
        ...(input.marketValuePerKg !== undefined ? { marketValuePerKg: input.marketValuePerKg } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: RECOVERY_INCLUDE,
    });

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId: recovery.batchId,
      status: recovery.batch.status,
      note: `Recovery record for ${recovery.materialType} updated`,
      actor,
      metadata: { recoveryId, fields: Object.keys(input) },
    });

    return updated;
  });
}

/** Deletion is limited to records on a batch that is still being processed. */
export async function deleteRecovery(actor: AuthUser, recoveryId: number) {
  const recovery = await prisma.recoveredMaterial.findUnique({
    where: { id: recoveryId },
    select: { id: true, batchId: true, materialType: true, quantityKg: true, batch: { select: { status: true, recyclerId: true } } },
  });
  if (!recovery) throw new NotFoundError('Recovery record');

  if (actor.role !== 'ADMIN' && recovery.batch.recyclerId !== actor.id) {
    throw new ForbiddenError('Only the recycler this batch is assigned to can delete its recovery records');
  }

  if (recovery.batch.status !== 'IN_PROGRESS') {
    throw new ConflictError(
      `Recovery records can only be deleted while the batch is IN_PROGRESS (current status: ${recovery.batch.status})`,
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.recoveredMaterial.delete({ where: { id: recoveryId } });

    await recordHistory(tx, {
      entityType: 'PROCESSING_BATCH',
      batchId: recovery.batchId,
      status: recovery.batch.status,
      note: `Recovery record removed: ${recovery.quantityKg} kg of ${recovery.materialType}`,
      actor,
      metadata: { recoveryId },
    });

    return { message: 'Recovery record deleted', recoveryId };
  });
}

/** Straight-from-the-database totals per material, used by charts and the summary cards. */
export async function recoveryByMaterial(scope: Prisma.RecoveredMaterialWhereInput = {}) {
  const grouped = await prisma.recoveredMaterial.groupBy({
    by: ['materialType'],
    where: scope,
    _sum: { quantityKg: true, marketValuePerKg: true },
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
