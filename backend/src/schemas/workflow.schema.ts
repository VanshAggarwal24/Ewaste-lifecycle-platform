import { z } from 'zod';
import {
  AssignmentMethod,
  BatchStatus,
  ItemCondition,
  ItemStatus,
  MaterialType,
  PickupStatus,
  ProcessingPath,
  QualityGrade,
} from '@prisma/client';
import { addressSchema, futureDateSchema, idParamSchema, paginationSchema } from './common.schema';

/**
 * Schemas for the lifecycle workflow: submission → pickup → collection → receipt →
 * inspection → batching → recycling → material recovery.
 */

// ---------------------------------------------------------------------------------------
// Items & submission
// ---------------------------------------------------------------------------------------

export const itemInputSchema = z.object({
  name: z.string().trim().min(2, 'must be at least 2 characters').max(160),
  categoryId: z.coerce.number().int().positive('select a category'),
  brand: z.string().trim().max(80).optional(),
  modelNumber: z.string().trim().max(80).optional(),
  serialNumber: z.string().trim().max(80).optional(),
  description: z.string().trim().max(600).optional(),
  quantity: z.coerce.number().int().positive().max(10000).default(1),
  estimatedWeightKg: z.coerce.number().positive('must be greater than zero').max(100000).optional(),
});

/**
 * Create one or more items. When `pickup` is supplied the API also creates (and links) a
 * pickup request for those items in the same transaction.
 */
export const createItemsSchema = z.object({
  items: z.array(itemInputSchema).min(1, 'submit at least one item').max(50, 'submit at most 50 items at a time'),
  pickup: z
    .object({
      address: addressSchema,
      preferredDate: futureDateSchema,
      timeSlot: z.string().trim().max(40).optional(),
      notes: z.string().trim().max(500).optional(),
      categoryId: z.coerce.number().int().positive().optional(),
      estimatedWeightKg: z.coerce.number().positive().max(100000).optional(),
    })
    .optional(),
});

export const updateItemSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    brand: z.string().trim().max(80).nullable().optional(),
    modelNumber: z.string().trim().max(80).nullable().optional(),
    serialNumber: z.string().trim().max(80).nullable().optional(),
    description: z.string().trim().max(600).nullable().optional(),
    quantity: z.coerce.number().int().positive().max(10000).optional(),
    estimatedWeightKg: z.coerce.number().positive().max(100000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const listItemsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(ItemStatus).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  centerId: z.coerce.number().int().positive().optional(),
  pickupRequestId: z.coerce.number().int().positive().optional(),
  unassignedToPickup: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

// ---------------------------------------------------------------------------------------
// Pickup requests
// ---------------------------------------------------------------------------------------

export const createPickupSchema = z.object({
  itemIds: z.array(z.coerce.number().int().positive()).min(1, 'select at least one item').max(50),
  address: addressSchema,
  preferredDate: futureDateSchema,
  timeSlot: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  estimatedWeightKg: z.coerce.number().positive().max(100000).optional(),
});

export const assignPickupSchema = z.object({
  method: z.nativeEnum(AssignmentMethod).default('AUTO'),
  agentId: z.coerce.number().int().positive().optional(), // users.id of a COLLECTION_AGENT
  force: z
    .boolean()
    .default(false)
    .describe('Reassign even when the request already has an agent (ADMIN only)'),
});

export const collectPickupSchema = z.object({
  collectedWeightKg: z.coerce.number().positive('must be greater than zero').max(100000).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const failPickupSchema = z.object({
  reason: z.string().trim().min(5, 'describe the reason in at least 5 characters').max(400),
});

export const receivePickupSchema = z.object({
  centerId: z.coerce.number().int().positive().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const cancelPickupSchema = z.object({
  reason: z.string().trim().max(400).optional(),
});

export const listPickupsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(PickupStatus).optional(),
  agentId: z.coerce.number().int().positive().optional(),
  centerId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  city: z.string().trim().max(80).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  unassigned: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

// ---------------------------------------------------------------------------------------
// Inspection & classification
// ---------------------------------------------------------------------------------------

export const createInspectionSchema = z.object({
  condition: z.nativeEnum(ItemCondition),
  qualityScore: z.coerce.number().int().min(0, 'must be between 0 and 100').max(100, 'must be between 0 and 100'),
  actualWeightKg: z.coerce.number().positive('must be greater than zero').max(100000),
  processingPath: z.nativeEnum(ProcessingPath).optional(),
  qualityGrade: z.nativeEnum(QualityGrade).optional(),
  isRepairable: z.boolean().default(false),
  hazardFlag: z.boolean().default(false),
  dataWipeRequired: z.boolean().default(true),
  dataWipeDone: z.boolean().default(false),
  remarks: z.string().trim().max(600).optional(),
  weightAllocationKg: z
    .array(z.object({ itemId: z.coerce.number().int().positive(), weightKg: z.coerce.number().positive() }))
    .optional()
    .describe('Optional per-item split when inspecting several items from the same pickup at once'),
});

export const bulkInspectSchema = z.object({
  inspections: z
    .array(
      createInspectionSchema
        .omit({ weightAllocationKg: true })
        .extend({ itemId: z.coerce.number().int().positive() }),
    )
    .min(1)
    .max(50),
});

export const updateInspectionSchema = z
  .object({
    condition: z.nativeEnum(ItemCondition).optional(),
    qualityScore: z.coerce.number().int().min(0).max(100).optional(),
    actualWeightKg: z.coerce.number().positive().max(100000).optional(),
    processingPath: z.nativeEnum(ProcessingPath).optional(),
    isRepairable: z.boolean().optional(),
    hazardFlag: z.boolean().optional(),
    dataWipeRequired: z.boolean().optional(),
    dataWipeDone: z.boolean().optional(),
    remarks: z.string().trim().max(600).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const listInspectionsQuerySchema = paginationSchema.extend({
  centerId: z.coerce.number().int().positive().optional(),
  processingPath: z.nativeEnum(ProcessingPath).optional(),
  condition: z.nativeEnum(ItemCondition).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

// ---------------------------------------------------------------------------------------
// Processing batches
// ---------------------------------------------------------------------------------------

export const createBatchSchema = z.object({
  name: z.string().trim().min(3, 'must be at least 3 characters').max(160),
  centerId: z.coerce.number().int().positive().optional(),
  processingPath: z.nativeEnum(ProcessingPath).optional(),
  targetWeightKg: z.coerce.number().positive().max(1_000_000).optional(),
  notes: z.string().trim().max(800).optional(),
  itemIds: z.array(z.coerce.number().int().positive()).max(200).optional(),
});

export const updateBatchSchema = z
  .object({
    name: z.string().trim().min(3).max(160).optional(),
    processingPath: z.nativeEnum(ProcessingPath).nullable().optional(),
    targetWeightKg: z.coerce.number().positive().max(1_000_000).nullable().optional(),
    notes: z.string().trim().max(800).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const addBatchItemsSchema = z.object({
  itemIds: z.array(z.coerce.number().int().positive()).min(1, 'select at least one item').max(200),
});

export const assignRecyclerSchema = z.object({
  recyclerId: z.coerce.number().int().positive('select a recycler'),
  notes: z.string().trim().max(800).optional(),
});

export const completeBatchSchema = z.object({
  actualWeightKg: z.coerce.number().positive().max(1_000_000).optional(),
  notes: z.string().trim().max(800).optional(),
});

export const listBatchesQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(BatchStatus).optional(),
  centerId: z.coerce.number().int().positive().optional(),
  recyclerId: z.coerce.number().int().positive().optional(),
  unassigned: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const batchItemParamSchema = idParamSchema.extend({
  itemId: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------------------------------
// Material recovery
// ---------------------------------------------------------------------------------------

export const createRecoverySchema = z.object({
  materialType: z.nativeEnum(MaterialType),
  quantityKg: z.coerce.number().positive('must be greater than zero').max(1_000_000),
  unit: z.string().trim().max(10).default('KG'),
  purityPct: z.coerce.number().positive('must be greater than zero').max(100, 'must not exceed 100').optional(),
  marketValuePerKg: z.coerce.number().min(0).max(10_000_000).optional(),
  itemId: z.coerce.number().int().positive().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const updateRecoverySchema = z
  .object({
    quantityKg: z.coerce.number().positive().max(1_000_000).optional(),
    purityPct: z.coerce.number().positive().max(100).nullable().optional(),
    marketValuePerKg: z.coerce.number().min(0).max(10_000_000).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const listRecoveriesQuerySchema = paginationSchema.extend({
  batchId: z.coerce.number().int().positive().optional(),
  materialType: z.nativeEnum(MaterialType).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

// ---------------------------------------------------------------------------------------
// History / timeline
// ---------------------------------------------------------------------------------------

export const listHistoryQuerySchema = paginationSchema.extend({
  entityType: z.enum(['PICKUP_REQUEST', 'EWASTE_ITEM', 'PROCESSING_BATCH']).optional(),
});

export type ItemInput = z.infer<typeof itemInputSchema>;
export type CreateItemsInput = z.infer<typeof createItemsSchema>;
export type CreatePickupInput = z.infer<typeof createPickupSchema>;
export type AssignPickupInput = z.infer<typeof assignPickupSchema>;
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type CreateRecoveryInput = z.infer<typeof createRecoverySchema>;
