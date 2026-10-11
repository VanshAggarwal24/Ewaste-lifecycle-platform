import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validatedParams, validatedQuery } from '../middleware/validate';
import { buildPaginationMeta, parsePagination, sendCreated, sendData, sendList } from '../utils/http';
import { idParamSchema } from '../schemas/common.schema';
import {
  assignPickupSchema,
  cancelPickupSchema,
  collectPickupSchema,
  createPickupSchema,
  failPickupSchema,
  listPickupsQuerySchema,
  receivePickupSchema,
} from '../schemas/workflow.schema';
import * as pickupService from '../services/pickup.service';
import * as assignmentService from '../services/assignment.service';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../lib/errors';

/**
 * Pickup request endpoints — the collection half of the lifecycle.
 *
 * Actions are gated by role *and* by relationship: an agent can only act on requests
 * assigned to them, centre staff on deliveries to their centre, a user on their own
 * requests. Those relationships are re-checked inside the transaction in pickup.service.
 */
export const pickupRouter = Router();
pickupRouter.use(authenticate);

pickupRouter.get(
  '/',
  validate({ query: listPickupsQuerySchema }),
  async (req, res) => {
    const query = validatedQuery<Parameters<typeof pickupService.listPickups>[1]>(req);
    const pagination = parsePagination(req.query, { limit: 20, maxLimit: 100 });
    const { requests, total } = await pickupService.listPickups(req.user!, query);
    return sendList(res, requests, buildPaginationMeta(total, pagination));
  },
);

pickupRouter.post(
  '/',
  requireRole('USER', 'ADMIN'),
  validate({ body: createPickupSchema }),
  async (req, res) => {
    const request = await pickupService.createPickup(req.user!, req.body);
    return sendCreated(res, { pickupRequest: request });
  },
);

pickupRouter.get('/:id', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const request = await pickupService.getPickup(req.user!, id);
  const actions = pickupService.availableActions(req.user!, {
    status: request.status,
    userId: request.userId,
    agentId: request.agentId,
    centerId: request.centerId,
  });
  return sendData(res, { pickupRequest: request, actions });
});

pickupRouter.get('/:id/timeline', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const timeline = await pickupService.getPickupTimeline(req.user!, id);
  return sendList(res, timeline, { total: timeline.length });
});

/** Assignment audit trail for one request (who decided what, with which scores). */
pickupRouter.get(
  '/:id/assignment-logs',
  requireRole('ADMIN', 'CENTER_STAFF'),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    await pickupService.getPickup(req.user!, id); // access check
    const logs = await prisma.assignmentLog.findMany({
      where: { pickupRequestId: id },
      include: {
        agent: { select: { id: true, user: { select: { id: true, fullName: true } } } },
        assignedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return sendList(res, logs, { total: logs.length });
  },
);

/** Dry run of the rule-based engine: shows the ranking without writing anything. */
pickupRouter.get(
  '/:id/assignment-preview',
  requireRole('ADMIN', 'CENTER_STAFF'),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    await pickupService.getPickup(req.user!, id); // access check
    const preview = await assignmentService.previewAssignment(id);
    return sendData(res, preview);
  },
);

/**
 * Assigns (or reassigns) a pickup. `method: AUTO` runs the rule-based engine;
 * `method: MANUAL` requires an explicit `agentId`.
 */
pickupRouter.post(
  '/:id/assign',
  requireRole('ADMIN', 'CENTER_STAFF'),
  validate({ params: idParamSchema, body: assignPickupSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    await pickupService.getPickup(req.user!, id); // access check

    const body = req.body as { method: 'AUTO' | 'MANUAL' | 'REASSIGNMENT'; agentId?: number; force: boolean };

    const result =
      body.method === 'MANUAL'
        ? await assignmentService.manualAssignPickup(
            id,
            requireAgentId(body.agentId),
            { id: req.user!.id, role: req.user!.role as 'ADMIN' | 'CENTER_STAFF' },
            { force: body.force },
          )
        : await assignmentService.autoAssignPickup(
            id,
            { id: req.user!.id, role: req.user!.role as 'ADMIN' | 'CENTER_STAFF' },
            { force: body.force },
          );

    return sendData(res, result);
  },
);

pickupRouter.post(
  '/:id/accept',
  requireRole('COLLECTION_AGENT', 'ADMIN'),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const request = await pickupService.acceptPickup(req.user!, id);
    return sendData(res, { pickupRequest: request });
  },
);

pickupRouter.post(
  '/:id/decline',
  requireRole('COLLECTION_AGENT', 'ADMIN'),
  validate({ params: idParamSchema, body: failPickupSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const request = await pickupService.declinePickup(req.user!, id, req.body.reason);
    return sendData(res, { pickupRequest: request });
  },
);

pickupRouter.post(
  '/:id/collect',
  requireRole('COLLECTION_AGENT', 'ADMIN'),
  validate({ params: idParamSchema, body: collectPickupSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const request = await pickupService.collectPickup(req.user!, id, req.body);
    return sendData(res, { pickupRequest: request });
  },
);

pickupRouter.post(
  '/:id/fail',
  requireRole('COLLECTION_AGENT', 'ADMIN'),
  validate({ params: idParamSchema, body: failPickupSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const request = await pickupService.failPickup(req.user!, id, req.body.reason);
    return sendData(res, { pickupRequest: request });
  },
);

pickupRouter.post(
  '/:id/receive',
  requireRole('CENTER_STAFF', 'ADMIN'),
  validate({ params: idParamSchema, body: receivePickupSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const request = await pickupService.receivePickup(req.user!, id, req.body);
    return sendData(res, { pickupRequest: request });
  },
);

pickupRouter.post(
  '/:id/cancel',
  validate({ params: idParamSchema, body: cancelPickupSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const request = await pickupService.cancelPickup(req.user!, id, req.body?.reason);
    return sendData(res, { pickupRequest: request });
  },
);

function requireAgentId(agentId: number | undefined): number {
  if (!agentId) {
    throw new NotFoundError(
      'Agent',
      'method=MANUAL requires an agentId (agent profile id from GET /api/users/agents)',
    );
  }
  return agentId;
}

export const pickupIdParam = idParamSchema;
export const zodBody = z;
