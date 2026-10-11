import type { Response } from 'express';
import { serialize, stripSensitiveFields } from './serialize';

/**
 * Response helpers.
 *
 * Every response passes through `serialize` (Decimal -> number) and
 * `stripSensitiveFields` (defence-in-depth against leaking password hashes), so a service
 * that accidentally selects `passwordHash` still cannot expose it over HTTP.
 */

/**
 * Single-resource response. Every success payload is wrapped in a `data` envelope so that
 * clients can rely on one shape for both single resources and collections (`{ data, meta }`).
 */
export function sendData<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json(stripSensitiveFields(serialize({ data })));
}

export function sendList<T>(
  res: Response,
  data: T[],
  meta?: object,
): Response {
  return res.status(200).json(stripSensitiveFields(serialize({ data, meta })));
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendData(res, data, 201);
}

export function sendMessage(res: Response, message: string, statusCode = 200): Response {
  return res.status(statusCode).json({ message });
}

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Normalises `?page=&limit=` query parameters into Prisma skip/take values. */
export function parsePagination(
  query: Record<string, unknown>,
  defaults: { page?: number; limit?: number; maxLimit?: number } = {},
): Pagination {
  const { page: defPage = 1, limit: defLimit = 20, maxLimit = 100 } = defaults;

  const rawPage = Number.parseInt(String(query.page ?? ''), 10);
  const rawLimit = Number.parseInt(String(query.limit ?? ''), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : defPage;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defLimit;

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function buildPaginationMeta(total: number, pagination: Pagination): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit);
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages,
    hasNextPage: pagination.page < totalPages,
    hasPreviousPage: pagination.page > 1 && total > 0,
  };
}
