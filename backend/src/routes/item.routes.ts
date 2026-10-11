import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validatedParams, validatedQuery } from '../middleware/validate';
import { buildPaginationMeta, parsePagination, sendCreated, sendData, sendList, sendMessage } from '../utils/http';
import { idParamSchema } from '../schemas/common.schema';
import {
  createInspectionSchema,
  createItemsSchema,
  listItemsQuerySchema,
  updateItemSchema,
} from '../schemas/workflow.schema';
import * as itemService from '../services/item.service';
import * as inspectionService from '../services/inspection.service';

/**
 * E-waste item endpoints.
 *
 * Reads are scoped per role inside the query (see item.service.itemAccessFilter), so a USER
 * only ever sees their own items and organisation roles only see items in their custody.
 */
export const itemRouter = Router();
itemRouter.use(authenticate);

itemRouter.get(
  '/',
  validate({ query: listItemsQuerySchema }),
  async (req, res) => {
    const query = validatedQuery<Parameters<typeof itemService.listItems>[1]>(req);
    const pagination = parsePagination(req.query, { limit: 20, maxLimit: 100 });
    const { items, total } = await itemService.listItems(req.user!, query);
    return sendList(res, items, buildPaginationMeta(total, pagination));
  },
);

itemRouter.get('/summary', async (req, res) => {
  const summary = await itemService.itemSummary(req.user!);
  return sendData(res, summary);
});

/** Items received at the caller's centre and still awaiting inspection (staff workflow). */
itemRouter.get(
  '/pending-inspection',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ query: z.object({ limit: z.coerce.number().int().positive().max(200).optional() }) }),
  async (req, res) => {
    const { limit } = validatedQuery<{ limit?: number }>(req);
    const items = await inspectionService.listPendingInspections(req.user!, limit ?? 50);
    return sendList(res, items, { total: items.length });
  },
);

itemRouter.post(
  '/',
  requireRole('USER', 'ADMIN'),
  validate({ body: createItemsSchema }),
  async (req, res) => {
    const result = await itemService.createItems(req.user!, req.body);
    return sendCreated(res, result);
  },
);

itemRouter.get('/:id', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const item = await itemService.getItem(req.user!, id);
  return sendData(res, { item });
});

/** Full, time-ordered lifecycle of one item (its own events + its pickup + its batch). */
itemRouter.get('/:id/timeline', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const timeline = await itemService.getItemTimeline(req.user!, id);
  return sendList(res, timeline, { total: timeline.length });
});

itemRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateItemSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const item = await itemService.updateItem(req.user!, id, req.body);
    return sendData(res, { item });
  },
);

itemRouter.post(
  '/:id/cancel',
  validate({ params: idParamSchema, body: z.object({ reason: z.string().trim().max(400).optional() }) }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const item = await itemService.cancelItem(req.user!, id, req.body?.reason);
    return sendData(res, { item });
  },
);

itemRouter.delete('/:id', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const result = await itemService.deleteItem(req.user!, id);
  return sendMessage(res, result.message);
});

/**
 * Inspection of a single item by centre staff. The item must be RECEIVED_AT_CENTER at the
 * staff member's own centre, and only one inspection may exist per item.
 */
itemRouter.post(
  '/:id/inspect',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({
    params: idParamSchema,
    body: createInspectionSchema.omit({ weightAllocationKg: true }),
  }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const inspection = await inspectionService.createInspection(req.user!, id, req.body);
    return sendCreated(res, { inspection });
  },
);
