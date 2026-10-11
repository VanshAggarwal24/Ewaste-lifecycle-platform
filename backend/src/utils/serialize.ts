import { Prisma } from '@prisma/client';

/**
 * Response serialisation.
 *
 * Prisma returns `Decimal` instances for NUMERIC columns (weights, coordinates, purity).
 * `Decimal#toJSON` yields a string, which would force every frontend chart to parse
 * numbers again. This module converts Decimal -> number (and Dates remain ISO strings via
 * JSON.stringify) exactly once, in the HTTP layer, so the API contract is plain JSON.
 *
 * Monetary/weight precision is preserved: the underlying NUMERIC scale is small enough
 * (<= 3 decimals) that IEEE-754 doubles are exact for these magnitudes.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Prisma.Decimal.isDecimal(value)) {
    const asNumber = (value as Prisma.Decimal).toNumber();
    return Number.isFinite(asNumber) ? asNumber : 0;
  }

  if (value instanceof Date) return value; // JSON.stringify -> ISO-8601

  if (Array.isArray(value)) return value.map(serializeValue);

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) out[key] = serializeValue(val);
    return out;
  }

  return value;
}

/** Deep-clones a payload, converting Prisma Decimal values into plain numbers. */
export function serialize<T>(payload: T): T {
  return serializeValue(payload) as T;
}

/** Never leak a password hash, even if a service accidentally selects it. */
export function stripSensitiveFields<T>(payload: T): T {
  const seen = new WeakSet<object>();

  const walk = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value as object)) return value;
    seen.add(value as object);

    if (Array.isArray(value)) return value.map(walk);
    if (Prisma.Decimal.isDecimal(value) || value instanceof Date) return value;

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (lower === 'passwordhash' || lower === 'password' || lower === 'currentpassword' ||
          lower === 'newpassword' || lower === 'jwtsecret') {
        continue;
      }
      out[key] = walk(val);
    }
    return out;
  };

  return walk(payload) as T;
}
