import { z } from 'zod';
import { addressSchema, phoneSchema } from './common.schema';

/**
 * Authentication & self-service profile schemas.
 *
 * SECURITY NOTE: `registerSchema` intentionally has **no `role` field**. Zod strips
 * unknown keys by default, so even if a client posts `{"role": "ADMIN"}`, the value is
 * discarded and the account is created with the default role USER. Privileged accounts
 * can only be created by an administrator (`POST /api/users`) or by the seed script.
 */

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('must be a valid email address').max(255),
  password: passwordSchema,
  fullName: z.string().trim().min(2, 'must be at least 2 characters').max(120),
  phone: phoneSchema.optional(),
  addressLine: z.string().trim().min(5).max(255).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  pincode: z.string().trim().regex(/^[0-9A-Za-z\- ]{4,12}$/).optional(),
  latitude: z.coerce.number().gte(-90).lte(90).optional(),
  longitude: z.coerce.number().gte(-180).lte(180).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: phoneSchema.nullable().optional(),
    addressLine: z.string().trim().min(5).max(255).nullable().optional(),
    city: z.string().trim().min(2).max(80).nullable().optional(),
    state: z.string().trim().min(2).max(80).nullable().optional(),
    pincode: z.string().trim().regex(/^[0-9A-Za-z\- ]{4,12}$/).nullable().optional(),
    latitude: z.coerce.number().gte(-90).lte(90).nullable().optional(),
    longitude: z.coerce.number().gte(-180).lte(180).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const addressBlock = addressSchema; // re-exported for readability at call sites

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
