import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError } from '../lib/errors';
import { buildSearchFilter, toNumber } from '../utils/queryFilters';
import type { CreateCenterInput, UpdateCenterInput } from '../schemas/center.schema';

/**
 * Collection centre management (reference data + operational statistics).
 */

const CENTER_LIST_SELECT = {
  id: true,
  name: true,
  code: true,
  addressLine: true,
  city: true,
  state: true,
  pincode: true,
  latitude: true,
  longitude: true,
  phone: true,
  email: true,
  capacityKg: true,
  status: true,
  createdAt: true,
  _count: { select: { staff: true, agents: true, items: true, batches: true } },
} as const;

export interface CenterListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  city?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function listCenters(query: CenterListQuery) {
  const where: Prisma.CollectionCenterWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
    ...(query.search
      ? { OR: buildSearchFilter(query.search, ['name', 'code', 'city', 'pincode']) }
      : {}),
  };

  const [centers, total] = await Promise.all([
    prisma.collectionCenter.findMany({
      where,
      select: CENTER_LIST_SELECT,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.collectionCenter.count({ where }),
  ]);

  return { centers, total };
}

export async function getCenter(id: number) {
  const center = await prisma.collectionCenter.findUnique({
    where: { id },
    select: {
      ...CENTER_LIST_SELECT,
      staff: { select: { id: true, fullName: true, email: true, role: true, status: true } },
      agents: {
        select: {
          id: true,
          isAvailable: true,
          isVerified: true,
          currentLoadCount: true,
          maxDailyPickups: true,
          user: { select: { id: true, fullName: true, email: true, status: true } },
        },
      },
    },
  });

  if (!center) throw new NotFoundError('Collection centre');
  return center;
}

/** Operational metrics for one centre, computed from live rows (no cached counters). */
export async function getCenterStats(id: number) {
  const center = await prisma.collectionCenter.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, capacityKg: true, status: true },
  });
  if (!center) throw new NotFoundError('Collection centre');

  const [
    itemsByStatus,
    inspectionsCompleted,
    openBatches,
    completedBatches,
    incomingPickups,
    receivedWeight,
    recoveredWeight,
  ] = await Promise.all([
    prisma.ewasteItem.groupBy({ by: ['status'], where: { centerId: id }, _count: { _all: true } }),
    prisma.inspection.count({ where: { centerId: id } }),
    prisma.processingBatch.count({ where: { centerId: id, status: { in: ['DRAFT', 'READY', 'RELEASED', 'IN_PROGRESS'] } } }),
    prisma.processingBatch.count({ where: { centerId: id, status: 'COMPLETED' } }),
    prisma.pickupRequest.count({
      where: { centerId: id, status: { in: ['ASSIGNED', 'ACCEPTED', 'COLLECTED'] } },
    }),
    prisma.inspection.aggregate({ where: { centerId: id }, _sum: { actualWeightKg: true } }),
    prisma.recoveredMaterial.aggregate({
      where: { batch: { centerId: id } },
      _sum: { quantityKg: true },
    }),
  ]);

  const itemsAtCenter = itemsByStatus
    .filter((row) => ['RECEIVED_AT_CENTER', 'INSPECTED', 'IN_BATCH', 'PROCESSING'].includes(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);

  const totalItems = itemsByStatus.reduce((sum, row) => sum + row._count._all, 0);
  const totalWeightKg = toNumber(receivedWeight._sum.actualWeightKg);
  const capacityKg = toNumber(center.capacityKg, 1);

  return {
    center,
    totalItems,
    itemsAtCenter,
    itemsByStatus: itemsByStatus.map((row) => ({ status: row.status, count: row._count._all })),
    inspectionsCompleted,
    openBatches,
    completedBatches,
    incomingPickups,
    totalWeightKg,
    recoveredWeightKg: toNumber(recoveredWeight._sum.quantityKg),
    // Utilisation is intentionally a simple weight-vs-capacity ratio and is documented as
    // such on the UI, so nobody mistakes it for a compliance metric.
    capacityUtilizationPct: capacityKg > 0 ? Math.round((totalWeightKg / capacityKg) * 1000) / 10 : 0,
  };
}

export async function createCenter(input: CreateCenterInput) {
  const duplicate = await prisma.collectionCenter.findFirst({
    where: { OR: [{ code: input.code }, { name: { equals: input.name, mode: 'insensitive' } }] },
    select: { id: true, code: true, name: true },
  });
  if (duplicate) {
    throw new ConflictError(`A collection centre with this ${duplicate.code === input.code ? 'code' : 'name'} already exists`);
  }

  return prisma.collectionCenter.create({
    data: {
      name: input.name,
      code: input.code,
      addressLine: input.addressLine,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      capacityKg: input.capacityKg,
      status: input.status,
    },
    select: CENTER_LIST_SELECT,
  });
}

export async function updateCenter(id: number, input: UpdateCenterInput) {
  await assertCenterExists(id);
  return prisma.collectionCenter.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.addressLine !== undefined ? { addressLine: input.addressLine } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.capacityKg !== undefined ? { capacityKg: input.capacityKg } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    select: CENTER_LIST_SELECT,
  });
}

/**
 * Deleting a centre would orphan the lifecycle records that reference it, so the
 * operation is refused while any exist. Decommissioning a centre is done by setting its
 * status to INACTIVE, which keeps history intact.
 */
export async function deleteCenter(id: number) {
  const center = await prisma.collectionCenter.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      _count: { select: { items: true, requests: true, batches: true, inspections: true, staff: true, agents: true } },
    },
  });
  if (!center) throw new NotFoundError('Collection centre');

  const dependencies = Object.values(center._count).reduce((sum, n) => sum + n, 0);
  if (dependencies > 0) {
    throw new ConflictError(
      'This centre is referenced by existing records and cannot be deleted. Set its status to INACTIVE instead.',
      { dependentRecords: dependencies },
    );
  }

  await prisma.collectionCenter.delete({ where: { id } });
  return { message: 'Collection centre deleted' };
}

async function assertCenterExists(id: number) {
  const center = await prisma.collectionCenter.findUnique({ where: { id }, select: { id: true } });
  if (!center) throw new NotFoundError('Collection centre');
}
