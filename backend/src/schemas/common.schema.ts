import { z } from 'zod';

/**
 * Reusable validation primitives shared by all request schemas.
 * Keeping them in one place guarantees that, for example, a pincode is validated
 * identically whether it arrives with a registration, an item or a pickup request.
 */

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('must be a positive integer'),
});

export const itemIdParamSchema = z.object({
  id: z.coerce.number().int().positive('must be a positive integer'),
  itemId: z.coerce.number().int().positive('must be a positive integer').optional(),
});

/** Indian-style pincode: 4-12 alphanumerics, matching the database CHECK constraint. */
export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z\- ]{4,12}$/, 'must be 4-12 letters, digits, spaces or dashes');

export const latitudeSchema = z.coerce.number().gte(-90, 'must be between -90 and 90').lte(90);
export const longitudeSchema = z.coerce.number().gte(-180, 'must be between -180 and 180').lte(180);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()\-]{7,20}$/, 'must be a valid phone number');

/** Structured address block reused by users, centres and pickup requests. */
export const addressSchema = z.object({
  addressLine: z.string().trim().min(5, 'must be at least 5 characters').max(255),
  city: z.string().trim().min(2, 'must be at least 2 characters').max(80),
  state: z.string().trim().min(2, 'must be at least 2 characters').max(80),
  pincode: pincodeSchema,
  latitude: latitudeSchema.optional().nullable(),
  longitude: longitudeSchema.optional().nullable(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().trim().max(40).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * A calendar date (no time component). Interpreted as UTC midnight so that a user in any
 * timezone records the same calendar day in the DATE column.
 */
export const futureDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), 'must be a real calendar date')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    // One day of slack absorbs timezone differences between client and server.
    return parsed.getTime() >= todayUtc - 24 * 60 * 60 * 1000;
  }, 'must not be in the past');

export function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Digits-only string of 6 numbers where an Indian pincode is expected. */
export const indianPincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, 'must be a 6-digit pincode');
