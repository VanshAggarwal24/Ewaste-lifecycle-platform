import type { ItemStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import { nextItemCode, nextPickupRequestCode } from '../utils/ids';
import { assertTransition } from '../utils/statusMachine';
import { buildSearchFilter, dateRangeFilter, toNumber } from '../utils/queryFilters';
import { toUtcDate } from '../schemas/common.schema';
import type { CreateItemsInput, ItemInput } from '../schemas/workflow.schema';
import { recordHistory, itemTimeline } from './history.service';

/**
 * E-waste item submission, retrieval and ownership rules.
 */

const ITEM_DETAIL_INCLUDE = {
  category: { select: { id: true, name: true, slug: true, hazardLevel: true, defaultPath: true } },
  center: { select: { id: true, name: true, code: true, city: true } },
  user: { select: { id: true, fullName: true, email: true, city: true, phone: true } },
  pickupRequest: {
    select: {
      id: true,
      requestCode: true,
      status: true,
      preferredDate: true,
      city: true,
      agentId: true,
      agent: {
        select: {
          id: true,
          user: { select: { id: true, fullName: true, phone: true } },
          vehicleType: true,
        },
      },
    },
  },
  inspection: {
    include: { inspectedBy: { select: { id: true, fullName: true } } },
  },
  batchItem: {
    select: {
      id: true,
      addedAt: true,
      weightAtAdditionKg: true,
      batch: {
        select: {
          id: true,
          batchCode: true,
          name: true,
          status: true,
          processingPath: true,
          recycler: { select: { id: true, fullName: true } },
        },
      },
    },
  },
} satisfies Prisma.EwasteItemInclude;

/**
 * Row-level access rules per role. Returned as a Prisma filter so that authorisation is
 * applied *in the query* rather than after fetching — a user cannot even cause another
 * user's rows to be read, and list endpoints paginate over the authorised subset only.
 */
export function itemAccessFilter(actor: AuthUser): Prisma.EwasteItemWhereInput {
  switch (actor.role) {
    case 'ADMIN':
      return {};
    case 'USER':
      return { userId: actor.id };
    case 'COLLECTION_AGENT':
      return actor.agentProfileId
        ? { pickupRequest: { agentId: actor.agentProfileId } }
        : { id: -1 }; // an agent without a profile owns nothing
    case 'CENTER_STAFF':
      return actor.staffedCenterId
        ? {
            OR: [
              { centerId: actor.staffedCenterId },
              { pickupRequest: { centerId: actor.staffedCenterId } },
            ],
          }
        : { id: -1 };
    case 'RECYCLER':
      return { batchItem: { batch: { recyclerId: actor.id } } };
    default:
      return { id: -1 };
  }
}

export interface ItemListQuery {
  page: number;
  limit: number;
  status?: ItemStatus;
  categoryId?: number;
  centerId?: number;
  pickupRequestId?: number;
  unassignedToPickup?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export async function listItems(actor: AuthUser, query: ItemListQuery) {
  const where: Prisma.EwasteItemWhereInput = {
    AND: [
      itemAccessFilter(actor),
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.centerId ? { centerId: query.centerId } : {}),
        ...(query.pickupRequestId ? { pickupRequestId: query.pickupRequestId } : {}),
        ...(query.unassignedToPickup ? { pickupRequestId: null } : {}),
        ...(query.search
          ? {
              OR: buildSearchFilter(query.search, ['name', 'brand', 'modelNumber', 'serialNumber', 'itemCode']),
            }
          : {}),
        ...(dateRangeFilter(query.from, query.to)
          ? { createdAt: dateRangeFilter(query.from, query.to) }
          : {}),
      },
    ],
  };

  const orderBy: Prisma.EwasteItemOrderByWithRelationInput =
    query.sortBy === 'weight'
      ? { estimatedWeightKg: query.sortOrder }
      : query.sortBy === 'name'
        ? { name: query.sortOrder }
        : { createdAt: query.sortOrder };

  const [items, total] = await Promise.all([
    prisma.ewasteItem.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        center: { select: { id: true, name: true, code: true } },
        pickupRequest: { select: { id: true, requestCode: true, status: true, preferredDate: true } },
        inspection: { select: { id: true, condition: true, qualityGrade: true, processingPath: true, actualWeightKg: true } },
        batchItem: { select: { batch: { select: { id: true, batchCode: true, status: true } } } },
      },
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.ewasteItem.count({ where }),
  ]);

  return { items, total };
}

export async function getItem(actor: AuthUser, id: number) {
  const item = await prisma.ewasteItem.findFirst({
    where: { AND: [{ id }, itemAccessFilter(actor)] },
    include: ITEM_DETAIL_INCLUDE,
  });

  // A record that exists but is not accessible returns 404 rather than 403 so that the
  // API does not confirm the existence of other users' records.
  if (!item) throw new NotFoundError('E-waste item');
  return item;
}

export async function getItemTimeline(actor: AuthUser, id: number) {
  await getItem(actor, id); // reuse the access check
  return itemTimeline(id);
}

/**
 * Submits one or more items — and, when `pickup` is provided, the pickup request that will
 * collect them.
 *
 * Everything happens in ONE transaction: if any item fails validation at the database
 * level (category deleted meanwhile, duplicate serial within the request, ...) the whole
 * submission is rolled back, so a user can never end up with a pickup request that
 * references items that were never created.
 */
export async function createItems(actor: AuthUser, input: CreateItemsInput) {
  if (actor.role !== 'USER' && actor.role !== 'ADMIN') {
    throw new ForbiddenError('Only USER accounts (or administrators) may submit e-waste items');
  }

  const categoryIds = [...new Set(input.items.map((i) => i.categoryId))];
  const activeCategories = await prisma.category.findMany({
    where: { id: { in: categoryIds }, isActive: true },
    select: { id: true },
  });
  if (activeCategories.length !== categoryIds.length) {
    const found = new Set(activeCategories.map((c) => c.id));
    const missing = categoryIds.filter((id) => !found.has(id));
    throw new ConflictError(
      `Unknown or inactive category id(s): ${missing.join(', ')}`,
      { missingCategoryIds: missing },
    );
  }

  return prisma.$transaction(async (tx) => {
    let pickupRequestId: number | null = null;
    let requestCode: string | null = null;

    const estimatedTotal =
      input.pickup?.estimatedWeightKg ??
      (input.items.some((i) => i.estimatedWeightKg !== undefined)
        ? input.items.reduce((sum, i) => sum + (i.estimatedWeightKg ?? 0), 0)
        : undefined);

    const distinctCategories = [...new Set(input.items.map((i) => i.categoryId))];

    if (input.pickup) {
      requestCode = await nextPickupRequestCode(tx);
      const request = await tx.pickupRequest.create({
        data: {
          requestCode,
          userId: actor.id,
          status: 'REQUESTED',
          addressLine: input.pickup.address.addressLine,
          city: input.pickup.address.city,
          state: input.pickup.address.state,
          pincode: input.pickup.address.pincode,
          latitude: input.pickup.address.latitude ?? null,
          longitude: input.pickup.address.longitude ?? null,
          preferredDate: toUtcDate(input.pickup.preferredDate),
          timeSlot: input.pickup.timeSlot ?? null,
          notes: input.pickup.notes ?? null,
          categoryId: input.pickup.categoryId ?? (distinctCategories.length === 1 ? distinctCategories[0] : null),
          estimatedWeightKg: estimatedTotal ? estimatedTotal : null,
        },
        select: { id: true, requestCode: true },
      });

      pickupRequestId = request.id;

      await recordHistory(tx, {
        entityType: 'PICKUP_REQUEST',
        pickupRequestId: request.id,
        status: 'REQUESTED',
        note: `Pickup requested for ${input.items.length} item(s), preferred date ${input.pickup.preferredDate}`,
        actor,
        metadata: {
          itemCount: input.items.length,
          estimatedWeightKg: estimatedTotal ?? null,
          city: input.pickup.address.city,
        },
      });
    }

    const createdItems = [];
    for (const payload of input.items) {
      const itemCode = await nextItemCode(tx);
      const item = await tx.ewasteItem.create({
        data: {
          itemCode,
          userId: actor.id,
          pickupRequestId,
          categoryId: payload.categoryId,
          name: payload.name,
          brand: payload.brand ?? null,
          modelNumber: payload.modelNumber ?? null,
          serialNumber: payload.serialNumber ?? null,
          description: payload.description ?? null,
          quantity: payload.quantity,
          estimatedWeightKg: payload.estimatedWeightKg ?? null,
          status: pickupRequestId ? 'PICKUP_SCHEDULED' : 'SUBMITTED',
        },
        select: { id: true, itemCode: true, name: true, status: true },
      });

      await recordHistory(tx, {
        entityType: 'EWASTE_ITEM',
        itemId: item.id,
        status: item.status,
        note: pickupRequestId
          ? `Item submitted and scheduled for pickup ${requestCode}`
          : 'Item submitted',
        actor,
        metadata: { itemCode: item.itemCode },
      });

      createdItems.push(item);
    }

    return {
      pickupRequest: pickupRequestId ? { id: pickupRequestId, requestCode } : null,
      items: createdItems,
      itemCount: createdItems.length,
    };
  });
}

/** Editable only while the item has not been handed over (status SUBMITTED). */
export async function updateItem(actor: AuthUser, id: number, input: Partial<ItemInput> & Record<string, unknown>) {
  const item = await prisma.ewasteItem.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, itemCode: true },
  });
  if (!item) throw new NotFoundError('E-waste item');

  if (actor.role !== 'ADMIN' && item.userId !== actor.id) {
    throw new ForbiddenError('You may only edit your own items');
  }

  if (item.status !== 'SUBMITTED') {
    throw new ConflictError(
      `An item with status ${item.status} can no longer be edited — it has already entered the collection workflow`,
    );
  }

  if (typeof input.categoryId === 'number') {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, isActive: true },
      select: { id: true },
    });
    if (!category) throw new ConflictError('The selected category does not exist or is inactive');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.ewasteItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name as string } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId as number } : {}),
        ...(input.brand !== undefined ? { brand: input.brand as string | null } : {}),
        ...(input.modelNumber !== undefined ? { modelNumber: input.modelNumber as string | null } : {}),
        ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber as string | null } : {}),
        ...(input.description !== undefined ? { description: input.description as string | null } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity as number } : {}),
        ...(input.estimatedWeightKg !== undefined
          ? { estimatedWeightKg: input.estimatedWeightKg as number | null }
          : {}),
      },
      select: { id: true, itemCode: true, name: true, status: true, quantity: true },
    });

    await recordHistory(tx, {
      entityType: 'EWASTE_ITEM',
      itemId: id,
      status: item.status,
      note: 'Item details updated by the owner',
      actor,
      metadata: { fields: Object.keys(input) },
    });

    return result;
  });

  return updated;
}

/** Cancelling is allowed only while the item is not physically in the workflow. */
export async function cancelItem(actor: AuthUser, id: number, reason?: string) {
  const item = await prisma.ewasteItem.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, itemCode: true, pickupRequestId: true },
  });
  if (!item) throw new NotFoundError('E-waste item');

  if (actor.role !== 'ADMIN' && item.userId !== actor.id) {
    throw new ForbiddenError('You may only cancel your own items');
  }

  if (item.pickupRequestId) {
    throw new ConflictError(
      'This item belongs to a pickup request. Cancel the pickup request instead so the collection agent is notified.',
      { pickupRequestId: item.pickupRequestId },
    );
  }

  assertTransition('item', item.status, 'CANCELLED', 'e-waste item');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ewasteItem.update({
      where: { id },
      data: { status: 'CANCELLED' },
      select: { id: true, itemCode: true, status: true },
    });

    await recordHistory(tx, {
      entityType: 'EWASTE_ITEM',
      itemId: id,
      status: 'CANCELLED',
      note: reason ? `Item cancelled: ${reason}` : 'Item cancelled by the owner',
      actor,
    });

    return updated;
  });
}

/** Deletion is limited to submissions that never entered the workflow. */
export async function deleteItem(actor: AuthUser, id: number) {
  const item = await prisma.ewasteItem.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, inspection: { select: { id: true } }, batchItem: { select: { id: true } } },
  });
  if (!item) throw new NotFoundError('E-waste item');

  if (actor.role !== 'ADMIN' && item.userId !== actor.id) {
    throw new ForbiddenError('You may only delete your own items');
  }

  if (item.status !== 'SUBMITTED' && actor.role !== 'ADMIN') {
    throw new ConflictError(
      `An item with status ${item.status} cannot be deleted because its lifecycle record must be preserved. Cancel it instead.`,
    );
  }

  if (item.inspection || item.batchItem) {
    throw new ConflictError('This item has inspection or processing records and cannot be deleted');
  }

  await prisma.ewasteItem.delete({ where: { id } });
  return { message: `Item deleted`, itemId: id };
}

/** Totals used by the user dashboard cards. */
export async function itemSummary(actor: AuthUser) {
  const where = itemAccessFilter(actor);

  const [byStatus, totalWeight, categoryCounts] = await Promise.all([
    prisma.ewasteItem.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.inspection.aggregate({
      where: { item: where },
      _sum: { actualWeightKg: true },
      _avg: { qualityScore: true },
    }),
    prisma.ewasteItem.groupBy({
      by: ['categoryId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { categoryId: 'desc' } },
      take: 5,
    }),
  ]);

  const categoryIds = categoryCounts.map((c) => c.categoryId);
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, hazardLevel: true },
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return {
    totalItems: byStatus.reduce((sum, row) => sum + row._count._all, 0),
    byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
    totalInspectedWeightKg: toNumber(totalWeight._sum.actualWeightKg),
    averageQualityScore: totalWeight._avg.qualityScore ? Math.round(totalWeight._avg.qualityScore * 10) / 10 : null,
    topCategories: categoryCounts.map((row) => ({
      categoryId: row.categoryId,
      name: categoryById.get(row.categoryId)?.name ?? 'Unknown',
      hazardLevel: categoryById.get(row.categoryId)?.hazardLevel ?? 1,
      count: row._count._all,
    })),
  };
}
