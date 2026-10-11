import type { Prisma } from '@prisma/client';

/**
 * Helpers that translate HTTP query strings into typed Prisma filters.
 * Keeping this here means route handlers stay thin and filters stay consistent across
 * list endpoints (e.g. `status=REJECTED` is validated against the enum, not trusted).
 */

export function buildSearchFilter(
  search: string | undefined,
  fields: string[],
): Record<string, unknown>[] {
  if (!search || !search.trim()) return [];
  const term = search.trim();
  return fields.map((field) => ({ [field]: { contains: term, mode: 'insensitive' as const } }));
}

export function dateRangeFilter(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) filter.gte = start;
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      // `to` is inclusive of the whole day when only a date is supplied.
      end.setHours(23, 59, 59, 999);
      filter.lte = end;
    }
  }
  return Object.keys(filter).length ? filter : undefined;
}

/** Converts a Prisma `Decimal | number | null` into a plain number (0 when null). */
export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : fallback;
}
