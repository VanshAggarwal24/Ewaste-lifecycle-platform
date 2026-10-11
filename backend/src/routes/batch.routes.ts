import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validatedParams, validatedQuery } from '../middleware/validate';
import { buildPaginationMeta, parsePagination, sendCreated, sendData, sendList, sendMessage } from '../utils/http';
import { idParamSchema } from '../schemas/common.schema';
import {
  addBatchItemsSchema,
  assignRecyclerSchema,
  batchItemParamSchema,
  completeBatchSchema,
  createBatchSchema,
  createRecoverySchema,
  listBatchesQuerySchema,
  updateBatchSchema,
} from '../schemas/workflow.schema';
import * as batchService from '../services/batch.service';
import * as recoveryService from '../services/recovery.service';

/**
 * Processing batch endpoints (centre → recycler handover).
 */
export const batchRouter = Router();
batchRouter.use(authenticate);

batchRouter.get(
  '/',
  validate({ query: listBatchesQuerySchema }),
  async (req, res) => {
    const query = validatedQuery<Parameters<typeof batchService.listBatches>[1]>(req);
    const pagination = parsePagination(req.query, { limit: 20, maxLimit: 100 });
    const { batches, total } = await batchService.listBatches(req.user!, query);
    return sendList(res, batches, buildPaginationMeta(total, pagination));
  },
);

/** Inspected items at the caller's centre that are not yet in any batch. */
batchRouter.get(
  '/batchable-items',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({
    query: z.object({
      centerId: z.coerce.number().int().positive().optional(),
      processingPath: z.string().trim().max(40).optional(),
    }),
  }),
  async (req, res) => {
    const query = validatedQuery<{ centerId?: number; processingPath?: string }>(req);
    const items = await batchService.listBatchableItems(req.user!, query);
    return sendList(res, items, { total: items.length });
  },
);

batchRouter.post(
  '/',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ body: createBatchSchema }),
  async (req, res) => {
    const batch = await batchService.createBatch(req.user!, req.body);
    const detail = await batchService.getBatch(req.user!, batch.id);
    return sendCreated(res, { batch: detail });
  },
);

batchRouter.get('/:id', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const batch = await batchService.getBatch(req.user!, id);
  const actions = batchService.batchActions(req.user!, {
    status: batch.status,
    centerId: batch.centerId,
    recyclerId: batch.recyclerId,
  });
  return sendData(res, { batch, actions });
});

batchRouter.get('/:id/timeline', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const timeline = await batchService.getBatchTimeline(req.user!, id);
  return sendList(res, timeline, { total: timeline.length });
});

batchRouter.patch(
  '/:id',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ params: idParamSchema, body: updateBatchSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const batch = await batchService.updateBatch(req.user!, id, req.body);
    return sendData(res, { batch });
  },
);

batchRouter.post(
  '/:id/items',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ params: idParamSchema, body: addBatchItemsSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const result = await batchService.addItemsToBatch(req.user!, id, req.body.itemIds);
    const batch = await batchService.getBatch(req.user!, id);
    return sendCreated(res, { ...result, batch });
  },
);

batchRouter.delete(
  '/:id/items/:itemId',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ params: batchItemParamSchema }),
  async (req, res) => {
    const { id, itemId } = validatedParams<{ id: number; itemId: number }>(req);
    const result = await batchService.removeItemFromBatch(req.user!, id, itemId);
    return sendMessage(res, result.message);
  },
);

batchRouter.post(
  '/:id/ready',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const batch = await batchService.markBatchReady(req.user!, id);
    return sendData(res, { batch });
  },
);

batchRouter.post(
  '/:id/recycler',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ params: idParamSchema, body: assignRecyclerSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const batch = await batchService.assignRecycler(req.user!, id, req.body.recyclerId, req.body.notes);
    return sendData(res, { batch });
  },
);

batchRouter.post(
  '/:id/release',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ params: idParamSchema, body: assignRecyclerSchema.partial() }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const batch = await batchService.releaseBatch(req.user!, id, req.body ?? {});
    return sendData(res, { batch });
  },
);

batchRouter.post(
  '/:id/start',
  requireRole('RECYCLER', 'ADMIN'),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const batch = await batchService.startBatch(req.user!, id);
    return sendData(res, { batch });
  },
);

batchRouter.post(
  '/:id/complete',
  requireRole('RECYCLER', 'ADMIN'),
  validate({ params: idParamSchema, body: completeBatchSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const batch = await batchService.completeBatch(req.user!, id, req.body);
    return sendData(res, { batch });
  },
);

batchRouter.delete(
  '/:id',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const result = await batchService.deleteBatch(req.user!, id);
    return sendMessage(res, result.message);
  },
);

// --- Material recovery (nested under a batch for creation, flat for editing) ------------

batchRouter.get('/:id/recoveries', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  await batchService.getBatch(req.user!, id); // access check
  const recoveries = await recoveryService.listRecoveries(req.user!, {
    page: 1,
    limit: 100,
    batchId: id,
    sortOrder: 'asc',
  });
  return sendList(res, recoveries.recoveries, { total: recoveries.total });
});

batchRouter.post(
  '/:id/recoveries',
  requireRole('RECYCLER', 'ADMIN'),
  validate({ params: idParamSchema, body: createRecoverySchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const recovery = await recoveryService.createRecovery(req.user!, id, req.body);
    return sendCreated(res, { recovery });
  },
);

export const recoveryRouter = Router();
recoveryRouter.use(authenticate);

recoveryRouter.get(
  '/',
  validate({
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
      batchId: z.coerce.number().int().positive().optional(),
      search: z.string().trim().max(120).optional(),
      from: z.string().trim().optional(),
      to: z.string().trim().optional(),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }),
  }),
  async (req, res) => {
    const query = validatedQuery<Parameters<typeof recoveryService.listRecoveries>[1]>(req);
    const pagination = parsePagination(req.query, { limit: 20, maxLimit: 100 });
    const { recoveries, total, totalQuantityKg } = await recoveryService.listRecoveries(req.user!, query);
    return sendList(res, recoveries, {
      ...buildPaginationMeta(total, pagination),
      totalQuantityKg,
    });
  },
);

recoveryRouter.get('/by-material', async (req, res) => {
  const byMaterial = await recoveryService.recoveryByMaterial(
    recoveryService.recoveryAccessFilter(req.user!),
  );
  return sendList(res, byMaterial, { total: byMaterial.length });
});

recoveryRouter.patch(
  '/:id',
  requireRole('RECYCLER', 'ADMIN'),
  validate({
    params: idParamSchema,
    body: z.object({
      quantityKg: z.coerce.number().positive().optional(),
      purityPct: z.coerce.number().positive().max(100).nullable().optional(),
      marketValuePerKg: z.coerce.number().min(0).nullable().optional(),
      notes: z.string().trim().max(500).nullable().optional(),
    }),
  }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const recovery = await recoveryService.updateRecovery(req.user!, id, req.body);
    return sendData(res, { recovery });
  },
);

recoveryRouter.delete(
  '/:id',
  requireRole('RECYCLER', 'ADMIN'),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const result = await recoveryService.deleteRecovery(req.user!, id);
    return sendMessage(res, result.message);
  },
);
