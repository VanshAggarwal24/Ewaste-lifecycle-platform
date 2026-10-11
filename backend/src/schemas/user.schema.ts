import { z } from 'zod';
import { MaterialType, Role, UserStatus } from '@prisma/client';
import { paginationSchema, phoneSchema } from './common.schema';

/**
 * Administrative user management.
 *
 * This is the *only* path (besides the seed script) through which privileged roles can be
 * created. It is mounted behind `authenticate` + `requireRole('ADMIN')`.
 */

const agentProfileInput = z.object({
  centerId: z.coerce.number().int().positive().nullable().optional(),
  vehicleType: z.string().trim().max(40).optional(),
  vehicleCapacityKg: z.coerce.number().positive('must be greater than zero').max(100000).default(50),
  maxDailyPickups: z.coerce.number().int().positive().max(200).default(10),
  isAvailable: z.boolean().default(true),
  isVerified: z.boolean().default(false),
});

const recyclerProfileInput = z.object({
  organizationName: z.string().trim().min(2, 'must be at least 2 characters').max(160),
  licenseNumber: z.string().trim().min(3, 'must be at least 3 characters').max(60),
  acceptedMaterials: z.array(z.nativeEnum(MaterialType)).min(1, 'select at least one material'),
  maxCapacityKg: z.coerce.number().positive().max(10_000_000).default(1000),
  isActive: z.boolean().default(true),
  contactPhone: phoneSchema.optional(),
});

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('must be a valid email address').max(255),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(128)
      .regex(/[A-Za-z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one digit'),
    fullName: z.string().trim().min(2).max(120),
    phone: phoneSchema.optional(),
    role: z.nativeEnum(Role),
    status: z.nativeEnum(UserStatus).default('ACTIVE'),
    staffedCenterId: z.coerce.number().int().positive().nullable().optional(),
    addressLine: z.string().trim().min(5).max(255).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    state: z.string().trim().min(2).max(80).optional(),
    pincode: z.string().trim().regex(/^[0-9A-Za-z\- ]{4,12}$/).optional(),
    latitude: z.coerce.number().gte(-90).lte(90).optional(),
    longitude: z.coerce.number().gte(-180).lte(180).optional(),
    agentProfile: agentProfileInput.optional(),
    recyclerProfile: recyclerProfileInput.optional(),
  })
  .superRefine((data, ctx) => {
    // The role determines which profile block is meaningful — reject contradictory input
    // instead of silently ignoring half of it.
    if (data.role === 'COLLECTION_AGENT' && !data.agentProfile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['agentProfile'],
        message: 'agentProfile is required when creating a COLLECTION_AGENT',
      });
    }
    if (data.role === 'RECYCLER' && !data.recyclerProfile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recyclerProfile'],
        message: 'recyclerProfile is required when creating a RECYCLER',
      });
    }
    if (data.role !== 'COLLECTION_AGENT' && data.agentProfile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['agentProfile'],
        message: 'agentProfile is only valid for the COLLECTION_AGENT role',
      });
    }
    if (data.role !== 'RECYCLER' && data.recyclerProfile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recyclerProfile'],
        message: 'recyclerProfile is only valid for the RECYCLER role',
      });
    }
    if (data.role === 'CENTER_STAFF' && !data.staffedCenterId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['staffedCenterId'],
        message: 'staffedCenterId is required when creating a CENTER_STAFF user',
      });
    }
  });

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: phoneSchema.nullable().optional(),
    role: z.nativeEnum(Role).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    staffedCenterId: z.coerce.number().int().positive().nullable().optional(),
    addressLine: z.string().trim().min(5).max(255).nullable().optional(),
    city: z.string().trim().min(2).max(80).nullable().optional(),
    state: z.string().trim().min(2).max(80).nullable().optional(),
    pincode: z.string().trim().regex(/^[0-9A-Za-z\- ]{4,12}$/).nullable().optional(),
    latitude: z.coerce.number().gte(-90).lte(90).nullable().optional(),
    longitude: z.coerce.number().gte(-180).lte(180).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const resetUserPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
});

export const listUsersQuerySchema = paginationSchema.extend({
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});

export const updateAgentProfileSchema = z
  .object({
    centerId: z.coerce.number().int().positive().nullable().optional(),
    vehicleType: z.string().trim().max(40).nullable().optional(),
    vehicleCapacityKg: z.coerce.number().positive().max(100000).optional(),
    maxDailyPickups: z.coerce.number().int().positive().max(200).optional(),
    isAvailable: z.boolean().optional(),
    isVerified: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const updateRecyclerProfileSchema = z
  .object({
    organizationName: z.string().trim().min(2).max(160).optional(),
    licenseNumber: z.string().trim().min(3).max(60).optional(),
    acceptedMaterials: z.array(z.nativeEnum(MaterialType)).min(1).optional(),
    maxCapacityKg: z.coerce.number().positive().max(10_000_000).optional(),
    isActive: z.boolean().optional(),
    contactPhone: phoneSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
