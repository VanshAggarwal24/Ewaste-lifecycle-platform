import type { ItemCondition, ProcessingPath, Prisma, QualityGrade } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import { dateRangeFilter, toNumber } from '../utils/queryFilters';
import type { CreateInspectionInput } from '../schemas/workflow.schema';
import { recordHistory } from './history.service';

/**
 * Centre inspection & classification.
 *
 * An inspection is the record that converts "a box arrived" into structured data:
 * measured weight, condition, quality, hazard flags and the processing path the centre
 * decides on. It also unlocks the item for batching.
 *
 * Duplicate prevention is two-layered: `inspections.item_id` is UNIQUE in the database, and
 * the service checks the item status first so the client gets a clear 409 instead of a raw
 * constraint error.
 */

/** Quality grade bands. Kept in one place because a database CHECK enforces the same bands. */
export const GRADE_BANDS: ReadonlyArray<{ grade: QualityGrade; min: number; max: number }> = [
  { grade: 'A', min: 85, max: 100 },
  { grade: 'B', min: 70, max: 84 },
  { grade: 'C', min: 50, max: 69 },
  { grade: 'D', min: 0, max: 49 },
];

/** Deterministic mapping from a 0-100 quality score to a letter grade. */
export function qualityGradeFromScore(score: number): QualityGrade {
  const band = GRADE_BANDS.find((b) => score >= b.min && score <= b.max);
  return band?.grade ?? 'D';
}

/**
 * Suggested processing path when the inspector does not choose one explicitly.
 * Rules (documented in README):
 *   - repairable + grade A/B  -> REFURBISHMENT
 *   - hazard flagged          -> MATERIAL_RECOVERY (safe dismantling)
 *   - repairable + grade C    -> COMPONENT_RECOVERY
 *   - grade D                 -> MATERIAL_RECOVERY
 * The category's `defaultPath` is used as the starting suggestion for hazardous categories.
 */
export function suggestProcessingPath(params: {
  condition: ItemCondition;
  qualityScore: number;
  isRepairable: boolean;
  hazardFlag: boolean;
  categoryDefaultPath: ProcessingPath;
  categoryHazardLevel: number;
}): ProcessingPath {
  if (params.isRepairable && params.qualityScore >= 70) return 'REFURBISHMENT';
  if (params.hazardFlag || params.categoryHazardLevel >= 4) return params.categoryDefaultPath;
  if (params.isRepairable && params.qualityScore >= 50) return 'COMPONENT_RECOVERY';
  if (params.qualityScore < 50) return 'MATERIAL_RECOVERY';
  return params.categoryDefaultPath;
}

const INSPECTION_INCLUDE = {
  center: { select: { id: true, name: true, code: true, city: true } },
  inspectedBy: { select: { id: true, fullName: true, role: true } },
  item: {
    select: {
      id: true,
      itemCode: true,
      name: true,
      status: true,
      quantity: true,
      estimatedWeightKg: true,
      userId: true,
      category: { select: { id: true, name: true, hazardLevel: true, defaultPath: true } },
      user: { select: { id: true, fullName: true, email: true } },
      pickupRequest: { select: { id: true, requestCode: true } },
    },
  },
} satisfies Prisma.InspectionInclude;

export function inspectionAccessFilter(actor: AuthUser): Prisma.InspectionWhereInput {
  switch (actor.role) {
    case 'ADMIN':
      return {};
    case 'CENTER_STAFF':
      return actor.staffedCenterId ? { centerId: actor.staffedCenterId } : { id: -1 };
    case 'USER':
      return { item: { userId: actor.id } };
    case 'COLLECTION_AGENT':
      return actor.agentProfileId ? { item: { pickupRequest: { agentId: actor.agentProfileId } } } : { id: -1 };
    case 'RECYCLER':
      return { item: { batchItem: { batch: { recyclerId: actor.id } } } };
    default:
      return { id: -1 };
  }
}

export interface InspectionListQuery {
  page: number;
  limit: number;
  centerId?: number;
  processingPath?: ProcessingPath;
  condition?: ItemCondition;
  search?: string;
  sortOrder: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export async function listInspections(actor: AuthUser, query: InspectionListQuery) {
  const where: Prisma.InspectionWhereInput = {
    AND: [
      inspectionAccessFilter(actor),
      {
        ...(query.centerId ? { centerId: query.centerId } : {}),
        ...(query.processingPath ? { processingPath: query.processingPath } : {}),
        ...(query.condition ? { condition: query.condition } : {}),
        ...(dateRangeFilter(query.from, query.to) ? { inspectedAt: dateRangeFilter(query.from, query.to) } : {}),
        ...(query.search
          ? {
              item: {
                OR: [{ name: { contains: query.search, mode: 'insensitive' } },
                     { itemCode: { contains: query.search, mode: 'insensitive' } }],
              },
            }
          : {}),
      },
    ],
  };

  const [inspections, total] = await Promise.all([
    prisma.inspection.findMany({
      where,
      include: INSPECTION_INCLUDE,
      orderBy: { inspectedAt: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.inspection.count({ where }),
  ]);

  return { inspections, total };
}

export async function getInspection(actor: AuthUser, id: number) {
  const inspection = await prisma.inspection.findFirst({
    where: { AND: [{ id }, inspectionAccessFilter(actor)] },
    include: INSPECTION_INCLUDE,
  });
  if (!inspection) throw new NotFoundError('Inspection');
  return inspection;
}

/** Items received at the caller's centre that are still waiting for inspection. */
export async function listPendingInspections(actor: AuthUser, limit = 50) {
  const centerId = actor.staffedCenterId;
  if (!centerId && actor.role !== 'ADMIN') {
    throw new ForbiddenError('Your staff account is not attached to a collection centre');
  }

  return prisma.ewasteItem.findMany({
    where: {
      status: 'RECEIVED_AT_CENTER',
      inspection: null,
      ...(actor.role === 'ADMIN' ? {} : { centerId }),
    },
    include: {
      category: { select: { id: true, name: true, hazardLevel: true, defaultPath: true } },
      user: { select: { id: true, fullName: true, email: true } },
      pickupRequest: { select: { id: true, requestCode: true, collectedAt: true } },
      center: { select: { id: true, name: true, code: true } },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });
}

interface InspectionPayload extends Omit<CreateInspectionInput, 'qualityGrade' | 'weightAllocationKg'> {}

/**
 * Records the inspection of one item and advances it to INSPECTED, in a single transaction
 * that also writes both history rows (one for the item, one note on the pickup request).
 */
export async function createInspection(actor: AuthUser, itemId: number, payload: InspectionPayload) {
  if (actor.role !== 'CENTER_STAFF' && actor.role !== 'ADMIN') {
    throw new ForbiddenError('Only collection-centre staff can inspect items');
  }

  const item = await prisma.ewasteItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      itemCode: true,
      name: true,
      status: true,
      centerId: true,
      pickupRequestId: true,
      inspection: { select: { id: true } },
      category: { select: { id: true, name: true, defaultPath: true, hazardLevel: true } },
    },
  });

  if (!item) throw new NotFoundError('E-waste item');

  if (item.inspection) {
    throw new ConflictError(
      `Item ${item.itemCode} has already been inspected. Update the existing inspection instead of creating a duplicate.`,
      { itemId, inspectionId: item.inspection.id },
    );
  }

  if (item.status !== 'RECEIVED_AT_CENTER') {
    throw new ConflictError(
      `Item ${item.itemCode} is in status ${item.status}; only items received at a centre (RECEIVED_AT_CENTER) can be inspected`,
      { currentStatus: item.status },
    );
  }

  const centerId = item.centerId ?? actor.staffedCenterId ?? null;
  if (!centerId) {
    throw new ConflictError('The item is not associated with a collection centre and cannot be inspected');
  }
  if (actor.role === 'CENTER_STAFF' && actor.staffedCenterId && centerId !== actor.staffedCenterId) {
    throw new ForbiddenError('You may only inspect items received at your own centre');
  }

  const grade = qualityGradeFromScore(payload.qualityScore);
  const processingPath =
    payload.processingPath ??
    suggestProcessingPath({
      condition: payload.condition,
      qualityScore: payload.qualityScore,
      isRepairable: payload.isRepairable,
      hazardFlag: payload.hazardFlag,
      categoryDefaultPath: item.category.defaultPath,
      categoryHazardLevel: item.category.hazardLevel,
    });

  // Mirrors the database CHECK so the client receives a field-level message.
  if (payload.isRepairable && processingPath === 'DISPOSAL') {
    throw new ConflictError('An item marked as repairable cannot be routed to DISPOSAL');
  }

  return prisma.$transaction(async (tx) => {
    const inspection = await tx.inspection.create({
      data: {
        itemId,
        centerId,
        inspectedById: actor.id,
        condition: payload.condition,
        qualityScore: payload.qualityScore,
        qualityGrade: grade,
        processingPath,
        actualWeightKg: payload.actualWeightKg,
        isRepairable: payload.isRepairable,
        hazardFlag: payload.hazardFlag,
        dataWipeRequired: payload.dataWipeRequired,
        dataWipeDone: payload.dataWipeDone,
        remarks: payload.remarks ?? null,
      },
      include: INSPECTION_INCLUDE,
    });

    await tx.ewasteItem.update({
      where: { id: itemId },
      data: { status: 'INSPECTED', centerId },
      select: { id: true },
    });

    await recordHistory(tx, {
      entityType: 'EWASTE_ITEM',
      itemId,
      status: 'INSPECTED',
      note: `Inspected: ${payload.condition}, grade ${grade} (score ${payload.qualityScore}/100), ${payload.actualWeightKg} kg, path ${processingPath}`,
      actor,
      metadata: {
        inspectionId: inspection.id,
        qualityGrade: grade,
        processingPath,
        actualWeightKg: payload.actualWeightKg,
        hazardFlag: payload.hazardFlag,
      },
    });

    if (item.pickupRequestId) {
      await recordHistory(tx, {
        entityType: 'PICKUP_REQUEST',
        pickupRequestId: item.pickupRequestId,
        status: 'RECEIVED_AT_CENTER',
        note: `Item ${item.itemCode} inspected and classified (grade ${grade}, path ${processingPath})`,
        actor,
        metadata: { itemId, inspectionId: inspection.id },
      });
    }

    return inspection;
  });
}

/** Inspects several items of one delivery in a single transaction (all-or-nothing). */
export async function bulkInspection(
  actor: AuthUser,
  payloads: Array<InspectionPayload & { itemId: number }>,
) {
  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const payload of payloads) {
      const { itemId, ...rest } = payload;

      const item = await tx.ewasteItem.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          itemCode: true,
          status: true,
          centerId: true,
          inspection: { select: { id: true } },
          category: { select: { defaultPath: true, hazardLevel: true } },
        },
      });
      if (!item) throw new NotFoundError(`E-waste item ${itemId}`);
      if (item.inspection) throw new ConflictError(`Item ${item.itemCode} has already been inspected`);
      if (item.status !== 'RECEIVED_AT_CENTER') {
        throw new ConflictError(`Item ${item.itemCode} is in status ${item.status} and cannot be inspected`);
      }

      const centerId = item.centerId ?? actor.staffedCenterId;
      if (!centerId) throw new ConflictError(`Item ${item.itemCode} is not associated with a collection centre`);
      if (actor.role === 'CENTER_STAFF' && actor.staffedCenterId && centerId !== actor.staffedCenterId) {
        throw new ForbiddenError('You may only inspect items received at your own centre');
      }

      const grade = qualityGradeFromScore(rest.qualityScore);
      const processingPath =
        rest.processingPath ??
        suggestProcessingPath({
          condition: rest.condition,
          qualityScore: rest.qualityScore,
          isRepairable: rest.isRepairable,
          hazardFlag: rest.hazardFlag,
          categoryDefaultPath: item.category.defaultPath,
          categoryHazardLevel: item.category.hazardLevel,
        });

      const inspection = await tx.inspection.create({
        data: {
          itemId,
          centerId,
          inspectedById: actor.id,
          condition: rest.condition,
          qualityScore: rest.qualityScore,
          qualityGrade: grade,
          processingPath,
          actualWeightKg: rest.actualWeightKg,
          isRepairable: rest.isRepairable,
          hazardFlag: rest.hazardFlag,
          dataWipeRequired: rest.dataWipeRequired,
          dataWipeDone: rest.dataWipeDone,
          remarks: rest.remarks ?? null,
        },
        select: { id: true, itemId: true, qualityGrade: true, processingPath: true, actualWeightKg: true },
      });

      await tx.ewasteItem.update({ where: { id: itemId }, data: { status: 'INSPECTED', centerId } });

      await recordHistory(tx, {
        entityType: 'EWASTE_ITEM',
        itemId,
        status: 'INSPECTED',
        note: `Inspected: ${rest.condition}, grade ${grade} (score ${rest.qualityScore}/100), ${rest.actualWeightKg} kg, path ${processingPath}`,
        actor,
        metadata: { inspectionId: inspection.id, processingPath, qualityGrade: grade },
      });

      results.push(inspection);
    }

    return { inspections: results, count: results.length };
  });
}

export async function updateInspection(
  actor: AuthUser,
  id: number,
  input: Partial<InspectionPayload>,
) {
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    select: { id: true, itemId: true, centerId: true, item: { select: { itemCode: true, status: true, batchItem: { select: { id: true } } } } },
  });
  if (!inspection) throw new NotFoundError('Inspection');

  if (actor.role !== 'ADMIN') {
    if (actor.role !== 'CENTER_STAFF') throw new ForbiddenError('Only centre staff can update inspections');
    if (actor.staffedCenterId && inspection.centerId && inspection.centerId !== actor.staffedCenterId) {
      throw new ForbiddenError('You may only update inspections at your own centre');
    }
  }

  // Once the item is inside a batch, its measured weight and classification are frozen:
  // downstream material-recovery numbers must stay explainable.
  if (inspection.item.batchItem && actor.role !== 'ADMIN') {
    throw new ConflictError(
      'This item is already in a processing batch; the inspection can no longer be modified',
    );
  }

  const nextScore = input.qualityScore;
  const grade = nextScore !== undefined ? qualityGradeFromScore(nextScore) : undefined;

  if (input.isRepairable && input.processingPath === 'DISPOSAL') {
    throw new ConflictError('An item marked as repairable cannot be routed to DISPOSAL');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.inspection.update({
      where: { id },
      data: {
        ...(input.condition !== undefined ? { condition: input.condition } : {}),
        ...(nextScore !== undefined ? { qualityScore: nextScore, qualityGrade: grade } : {}),
        ...(input.actualWeightKg !== undefined ? { actualWeightKg: input.actualWeightKg } : {}),
        ...(input.processingPath !== undefined ? { processingPath: input.processingPath } : {}),
        ...(input.isRepairable !== undefined ? { isRepairable: input.isRepairable } : {}),
        ...(input.hazardFlag !== undefined ? { hazardFlag: input.hazardFlag } : {}),
        ...(input.dataWipeRequired !== undefined ? { dataWipeRequired: input.dataWipeRequired } : {}),
        ...(input.dataWipeDone !== undefined ? { dataWipeDone: input.dataWipeDone } : {}),
        ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
      },
      include: INSPECTION_INCLUDE,
    });

    await recordHistory(tx, {
      entityType: 'EWASTE_ITEM',
      itemId: inspection.itemId,
      status: inspection.item.status,
      note: 'Inspection updated by centre staff',
      actor,
      metadata: { inspectionId: id, fields: Object.keys(input) },
    });

    return updated;
  });
}

/** Aggregate inspection metrics for a centre (or platform-wide for an admin). */
export async function inspectionSummary(actor: AuthUser) {
  const where: Prisma.InspectionWhereInput =
    actor.role === 'ADMIN' ? {} : { centerId: actor.staffedCenterId ?? -1 };

  const [byPath, byCondition, byGrade, weights, hazardCount] = await Promise.all([
    prisma.inspection.groupBy({ by: ['processingPath'], where, _count: { _all: true } }),
    prisma.inspection.groupBy({ by: ['condition'], where, _count: { _all: true } }),
    prisma.inspection.groupBy({ by: ['qualityGrade'], where, _count: { _all: true } }),
    prisma.inspection.aggregate({
      where,
      _sum: { actualWeightKg: true },
      _avg: { qualityScore: true },
      _count: { _all: true },
    }),
    prisma.inspection.count({ where: { ...where, hazardFlag: true } }),
  ]);

  return {
    inspectionsCompleted: weights._count._all,
    totalWeightKg: toNumber(weights._sum.actualWeightKg),
    averageQualityScore: weights._avg.qualityScore ? Math.round(weights._avg.qualityScore * 10) / 10 : null,
    hazardFlagged: hazardCount,
    byProcessingPath: byPath.map((r) => ({ path: r.processingPath, count: r._count._all })),
    byCondition: byCondition.map((r) => ({ condition: r.condition, count: r._count._all })),
    byGrade: byGrade.map((r) => ({ grade: r.qualityGrade, count: r._count._all })),
  };
}
