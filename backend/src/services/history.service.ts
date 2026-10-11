import { LifecycleEntity, type Prisma, type Role } from '@prisma/client';
import type { Tx } from '../lib/prisma';
import { prisma } from '../lib/prisma';

/**
 * The append-only lifecycle audit trail.
 *
 * Every state change in the system writes exactly one row here, inside the same
 * transaction as the change itself. That is what makes the platform a *tracker*: the
 * timeline can always be reconstructed and proved, and it can never drift from the
 * current status because both are written atomically.
 *
 * The database additionally enforces that a history row has exactly one parent and that
 * rows are never updated or deleted (see the `integrity_constraints` migration).
 */

export interface HistoryInput {
  entityType: LifecycleEntity;
  pickupRequestId?: number | null;
  itemId?: number | null;
  batchId?: number | null;
  status: string;
  note?: string | null;
  actor?: { id: number; role: Role } | null;
  metadata?: Prisma.InputJsonValue | null;
  at?: Date;
}

export async function recordHistory(tx: Tx, input: HistoryInput) {
  const parents = [input.pickupRequestId, input.itemId, input.batchId].filter(
    (v) => v !== null && v !== undefined,
  );

  // Fail fast in the service layer with a clear message rather than letting the database
  // CHECK constraint produce a driver-level error.
  if (parents.length !== 1) {
    throw new Error(
      `recordHistory requires exactly one parent (got ${parents.length}) for entity ${input.entityType}`,
    );
  }

  return tx.statusHistory.create({
    data: {
      entityType: input.entityType,
      pickupRequestId: input.pickupRequestId ?? null,
      itemId: input.itemId ?? null,
      batchId: input.batchId ?? null,
      status: input.status,
      note: input.note ?? null,
      actorId: input.actor?.id ?? null,
      actorRole: input.actor?.role ?? null,
      metadata: input.metadata ?? undefined,
      createdAt: input.at ?? new Date(),
    },
  });
}

/** Records the same event for many items at once (e.g. a pickup moving to COLLECTED). */
export async function recordHistoryForItems(
  tx: Tx,
  itemIds: number[],
  status: string,
  opts: { note?: string; actor?: { id: number; role: Role } | null; metadata?: Prisma.InputJsonValue; at?: Date } = {},
) {
  for (const itemId of itemIds) {
    await recordHistory(tx, {
      entityType: 'EWASTE_ITEM',
      itemId,
      status,
      note: opts.note,
      actor: opts.actor,
      metadata: opts.metadata,
      at: opts.at,
    });
  }
}

const HISTORY_INCLUDE = {
  actor: { select: { id: true, fullName: true, role: true } },
} satisfies Prisma.StatusHistoryInclude;

export type TimelineEvent = {
  id: number;
  entityType: LifecycleEntity;
  status: string;
  note: string | null;
  createdAt: Date;
  actor: { id: number; fullName: string; role: Role } | null;
  metadata: Prisma.JsonValue | null;
  subject: 'ITEM' | 'PICKUP_REQUEST' | 'BATCH';
  subjectRef: string | null;
};

/**
 * Builds the complete, time-ordered lifecycle of an item: the item's own events plus the
 * events of the pickup request(s) that carried it and of the batch(es) it was processed in.
 * This is what the "Lifecycle Timeline" screen renders.
 */
export async function itemTimeline(itemId: number): Promise<TimelineEvent[]> {
  const item = await prisma.ewasteItem.findUnique({
    where: { id: itemId },
    select: { id: true, itemCode: true, pickupRequestId: true },
  });

  if (!item) return [];

  const batchLinks = await prisma.batchItem.findMany({
    where: { itemId },
    select: { batchId: true },
  });
  const batchIds = batchLinks.map((b) => b.batchId);

  const rows = await prisma.statusHistory.findMany({
    where: {
      OR: [
        { itemId },
        ...(item.pickupRequestId ? [{ pickupRequestId: item.pickupRequestId }] : []),
        ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
      ],
    },
    include: HISTORY_INCLUDE,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    actor: row.actor,
    metadata: row.metadata,
    subject: row.itemId ? 'ITEM' : row.pickupRequestId ? 'PICKUP_REQUEST' : 'BATCH',
    subjectRef: row.itemId ? item.itemCode : null,
  }));
}

/** Timeline for a pickup request, including the events of every item it carried. */
export async function pickupTimeline(pickupRequestId: number): Promise<TimelineEvent[]> {
  const request = await prisma.pickupRequest.findUnique({
    where: { id: pickupRequestId },
    select: { id: true, requestCode: true, items: { select: { id: true, itemCode: true } } },
  });

  if (!request) return [];

  const itemIds = request.items.map((i) => i.id);
  const codeByItemId = new Map(request.items.map((i) => [i.id, i.itemCode]));

  const rows = await prisma.statusHistory.findMany({
    where: {
      OR: [{ pickupRequestId }, ...(itemIds.length ? [{ itemId: { in: itemIds } }] : [])],
    },
    include: HISTORY_INCLUDE,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    actor: row.actor,
    metadata: row.metadata,
    subject: row.itemId ? 'ITEM' : 'PICKUP_REQUEST',
    subjectRef: row.itemId ? (codeByItemId.get(row.itemId) ?? null) : request.requestCode,
  }));
}

/** Timeline for a processing batch, including the items inside it. */
export async function batchTimeline(batchId: number): Promise<TimelineEvent[]> {
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, batchCode: true, batchItems: { select: { itemId: true } } },
  });

  if (!batch) return [];

  const itemIds = batch.batchItems.map((bi) => bi.itemId);

  const rows = await prisma.statusHistory.findMany({
    where: { OR: [{ batchId }, ...(itemIds.length ? [{ itemId: { in: itemIds } }] : [])] },
    include: HISTORY_INCLUDE,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    actor: row.actor,
    metadata: row.metadata,
    subject: row.batchId ? 'BATCH' : 'ITEM',
    subjectRef: row.batchId ? batch.batchCode : null,
  }));
}

/** Platform-wide recent activity feed (admin dashboard, live "what is happening" view). */
export async function recentActivity(limit = 20): Promise<TimelineEvent[]> {
  const rows = await prisma.statusHistory.findMany({
    include: HISTORY_INCLUDE,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(limit, 1), 100),
  });

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    actor: row.actor,
    metadata: row.metadata,
    subject: row.itemId ? 'ITEM' : row.pickupRequestId ? 'PICKUP_REQUEST' : 'BATCH',
    subjectRef: null,
  }));
}
