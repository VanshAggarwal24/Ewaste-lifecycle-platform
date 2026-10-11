import { z } from 'zod';
import { ProcessingPath } from '@prisma/client';
import { paginationSchema } from './common.schema';

/**
 * Category reference data. Categories drive the hazard level and the *default* processing
 * path suggested to centre staff during inspection.
 */

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'must be at least 2 characters').max(80),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(400).optional(),
  hazardLevel: z.coerce.number().int().min(1, 'must be between 1 and 5').max(5, 'must be between 1 and 5').default(1),
  defaultPath: z.nativeEnum(ProcessingPath).default('MATERIAL_RECOVERY'),
  isActive: z.boolean().default(true),
});

/** Slug is derived from the name when the client does not supply one. */
export const createCategoryWithSlugSchema = createCategorySchema.transform((data) => ({
  ...data,
  slug: data.slug ? slugify(data.slug) : slugify(data.name),
}));

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(400).nullable().optional(),
    hazardLevel: z.coerce.number().int().min(1).max(5).optional(),
    defaultPath: z.nativeEnum(ProcessingPath).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const listCategoriesQuerySchema = paginationSchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  hazardLevel: z.coerce.number().int().min(1).max(5).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
