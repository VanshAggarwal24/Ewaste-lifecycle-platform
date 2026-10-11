import { Router } from 'express';
import { authenticate, requireAdmin, requireRole } from '../middleware/auth';
import { validate, validatedParams, validatedQuery } from '../middleware/validate';
import { buildPaginationMeta, parsePagination, sendCreated, sendData, sendList, sendMessage } from '../utils/http';
import { idParamSchema } from '../schemas/common.schema';
import {
  createCategoryWithSlugSchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '../schemas/category.schema';
import {
  createCenterSchema,
  listCentersQuerySchema,
  updateCenterSchema,
} from '../schemas/center.schema';
import * as centerService from '../services/center.service';
import * as categoryService from '../services/category.service';

/**
 * Reference data: collection centres and e-waste categories.
 *
 * Reads are available to every signed-in role (the submission form needs categories, and
 * coordinators need the centre list). Writes are administrator-only.
 */

export const categoryRouter = Router();
categoryRouter.use(authenticate);

categoryRouter.get(
  '/',
  validate({ query: listCategoriesQuerySchema }),
  async (req, res) => {
    const query = validatedQuery<Parameters<typeof categoryService.listCategories>[0]>(req);
    const pagination = parsePagination(req.query, { limit: 50 });
    const { categories, total } = await categoryService.listCategories({
      ...query,
      sortOrder: query.sortOrder ?? 'asc',
    });
    return sendList(res, categories, buildPaginationMeta(total, pagination));
  },
);

categoryRouter.post(
  '/',
  requireAdmin,
  validate({ body: createCategoryWithSlugSchema }),
  async (req, res) => {
    const category = await categoryService.createCategory(req.body);
    return sendCreated(res, { category });
  },
);

categoryRouter.get('/:id', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const category = await categoryService.getCategory(id);
  return sendData(res, { category });
});

categoryRouter.patch(
  '/:id',
  requireAdmin,
  validate({ params: idParamSchema, body: updateCategorySchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const category = await categoryService.updateCategory(id, req.body);
    return sendData(res, { category });
  },
);

categoryRouter.delete(
  '/:id',
  requireAdmin,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const result = await categoryService.deleteCategory(id);
    return sendMessage(res, result.message);
  },
);

export const centerRouter = Router();
centerRouter.use(authenticate);

centerRouter.get(
  '/',
  validate({ query: listCentersQuerySchema }),
  async (req, res) => {
    const query = validatedQuery<Parameters<typeof centerService.listCenters>[0]>(req);
    const pagination = parsePagination(req.query, { limit: 50 });
    const { centers, total } = await centerService.listCenters({ ...query, sortOrder: query.sortOrder ?? 'asc' });
    return sendList(res, centers, buildPaginationMeta(total, pagination));
  },
);

centerRouter.post(
  '/',
  requireAdmin,
  validate({ body: createCenterSchema }),
  async (req, res) => {
    const center = await centerService.createCenter(req.body);
    return sendCreated(res, { center });
  },
);

/** Operational statistics — administrators and centre staff only. */
centerRouter.get(
  '/:id/stats',
  requireRole('ADMIN', 'CENTER_STAFF'),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const stats = await centerService.getCenterStats(id);
    return sendData(res, stats);
  },
);

centerRouter.get('/:id', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const center = await centerService.getCenter(id);
  return sendData(res, { center });
});

centerRouter.patch(
  '/:id',
  requireAdmin,
  validate({ params: idParamSchema, body: updateCenterSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const center = await centerService.updateCenter(id, req.body);
    return sendData(res, { center });
  },
);

centerRouter.delete(
  '/:id',
  requireAdmin,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const result = await centerService.deleteCenter(id);
    return sendMessage(res, result.message);
  },
);
