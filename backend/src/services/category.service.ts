import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError } from '../lib/errors';
import { buildSearchFilter } from '../utils/queryFilters';
import { slugify, type CreateCategoryInput, type UpdateCategoryInput } from '../schemas/category.schema';

/**
 * E-waste category reference data.
 *
 * Categories carry the hazard level (1-5) and the *default* processing path that centre
 * staff see pre-selected during inspection. Staff may override the suggestion; the
 * category is a hint, not a policy engine.
 */

export interface CategoryListQuery {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  hazardLevel?: number;
  sortOrder?: 'asc' | 'desc';
}

export async function listCategories(query: CategoryListQuery) {
  const where: Prisma.CategoryWhereInput = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.hazardLevel ? { hazardLevel: query.hazardLevel } : {}),
    ...(query.search ? { OR: buildSearchFilter(query.search, ['name', 'description']) } : {}),
  };

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: [{ hazardLevel: 'desc' }, { name: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.category.count({ where }),
  ]);

  return { categories, total };
}

export async function getCategory(id: number) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
  if (!category) throw new NotFoundError('Category');
  return category;
}

export async function createCategory(input: CreateCategoryInput) {
  const duplicate = await prisma.category.findFirst({
    where: { OR: [{ name: { equals: input.name, mode: 'insensitive' } }, { slug: input.slug }] },
    select: { id: true, name: true },
  });
  if (duplicate) throw new ConflictError(`A category named "${duplicate.name}" already exists`);

  return prisma.category.create({
    data: {
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      description: input.description ?? null,
      hazardLevel: input.hazardLevel,
      defaultPath: input.defaultPath,
      isActive: input.isActive,
    },
    include: { _count: { select: { items: true } } },
  });
}

export async function updateCategory(id: number, input: UpdateCategoryInput) {
  await assertCategoryExists(id);

  if (input.name) {
    const clash = await prisma.category.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' }, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw new ConflictError('Another category already uses this name');
  }

  return prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.hazardLevel !== undefined ? { hazardLevel: input.hazardLevel } : {}),
      ...(input.defaultPath !== undefined ? { defaultPath: input.defaultPath } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { _count: { select: { items: true } } },
  });
}

export async function deleteCategory(id: number) {
  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { items: true } } },
  });
  if (!category) throw new NotFoundError('Category');

  if (category._count.items > 0) {
    throw new ConflictError(
      `This category is still used by ${category._count.items} item(s). Deactivate it instead of deleting.`,
      { dependentRecords: category._count.items },
    );
  }

  await prisma.category.delete({ where: { id } });
  return { message: 'Category deleted' };
}

async function assertCategoryExists(id: number) {
  const category = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!category) throw new NotFoundError('Category');
}
