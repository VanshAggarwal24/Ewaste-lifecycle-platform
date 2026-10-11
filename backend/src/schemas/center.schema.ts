import { z } from 'zod';
import { CenterStatus } from '@prisma/client';
import { addressSchema, paginationSchema } from './common.schema';

export const createCenterSchema = addressSchema
  .extend({
    name: z.string().trim().min(3, 'must be at least 3 characters').max(160),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9\-]{2,20}$/, 'must be 2-20 characters: A-Z, 0-9 or dash'),
    phone: z.string().trim().regex(/^\+?[0-9 ()\-]{7,20}$/).optional(),
    email: z.string().trim().toLowerCase().email('must be a valid email address').optional(),
    capacityKg: z.coerce.number().positive('must be greater than zero').default(5000),
    status: z.nativeEnum(CenterStatus).default('ACTIVE'),
  })
  .superRefine((data, ctx) => {
    // Latitude and longitude are optional, but a half-specified coordinate is meaningless.
    const hasLat = data.latitude !== undefined && data.latitude !== null;
    const hasLng = data.longitude !== undefined && data.longitude !== null;
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasLat ? 'longitude' : 'latitude'],
        message: 'latitude and longitude must be provided together',
      });
    }
  });

export const updateCenterSchema = z
  .object({
    name: z.string().trim().min(3).max(160).optional(),
    addressLine: z.string().trim().min(5).max(255).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    state: z.string().trim().min(2).max(80).optional(),
    pincode: z.string().trim().regex(/^[0-9A-Za-z\- ]{4,12}$/).optional(),
    latitude: z.coerce.number().gte(-90).lte(90).nullable().optional(),
    longitude: z.coerce.number().gte(-180).lte(180).nullable().optional(),
    phone: z.string().trim().regex(/^\+?[0-9 ()\-]{7,20}$/).nullable().optional(),
    email: z.string().trim().toLowerCase().email().nullable().optional(),
    capacityKg: z.coerce.number().positive().optional(),
    status: z.nativeEnum(CenterStatus).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const listCentersQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(CenterStatus).optional(),
  city: z.string().trim().max(80).optional(),
});

export type CreateCenterInput = z.infer<typeof createCenterSchema>;
export type UpdateCenterInput = z.infer<typeof updateCenterSchema>;
