import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin, requireRole } from '../middleware/auth';
import { validate, validatedParams, validatedQuery } from '../middleware/validate';
import { buildPaginationMeta, parsePagination, sendCreated, sendData, sendList } from '../utils/http';
import { idParamSchema } from '../schemas/common.schema';
import { bulkInspectSchema, listInspectionsQuerySchema, updateInspectionSchema } from '../schemas/workflow.schema';
import * as inspectionService from '../services/inspection.service';
import * as analyticsService from '../services/analytics.service';
import * as dashboardService from '../services/dashboard.service';
import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';

/**
 * Inspection, analytics, dashboard and activity endpoints.
 */

export const inspectionRouter = Router();
inspectionRouter.use(authenticate, requireRole('CENTER_STAFF', 'ADMIN'));

inspectionRouter.get(
  '/',
  validate({ query: listInspectionsQuerySchema }),
  async (req, res) => {
    const query = validatedQuery<Parameters<typeof inspectionService.listInspections>[1]>(req);
    const pagination = parsePagination(req.query, { limit: 20, maxLimit: 100 });
    const { inspections, total } = await inspectionService.listInspections(req.user!, query);
    return sendList(res, inspections, buildPaginationMeta(total, pagination));
  },
);

inspectionRouter.get('/summary', async (req, res) => {
  const summary = await inspectionService.inspectionSummary(req.user!);
  return sendData(res, summary);
});

/** Bulk inspection of several items from the same delivery (single transaction). */
inspectionRouter.post(
  '/bulk',
  validate({ body: bulkInspectSchema }),
  async (req, res) => {
    const result = await inspectionService.bulkInspection(req.user!, req.body.inspections);
    return sendCreated(res, result);
  },
);

inspectionRouter.get('/:id', validate({ params: idParamSchema }), async (req, res) => {
  const { id } = validatedParams<{ id: number }>(req);
  const inspection = await inspectionService.getInspection(req.user!, id);
  return sendData(res, { inspection });
});

inspectionRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateInspectionSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const inspection = await inspectionService.updateInspection(req.user!, id, req.body);
    return sendData(res, { inspection });
  },
);

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

analyticsRouter.get(
  '/overview',
  validate({ query: z.object({ months: z.coerce.number().int().min(1).max(36).optional() }) }),
  async (req, res) => {
    const { months } = validatedQuery<{ months?: number }>(req);
    const overview = await analyticsService.getOverview(req.user!, months ?? 6);
    return sendData(res, overview);
  },
);

analyticsRouter.get('/summary', async (req, res) => {
  const summary = await analyticsService.getSummary(req.user!);
  return sendData(res, summary);
});

analyticsRouter.get(
  '/monthly',
  validate({ query: z.object({ months: z.coerce.number().int().min(1).max(36).optional() }) }),
  async (req, res) => {
    const { months } = validatedQuery<{ months?: number }>(req);
    const monthly = await analyticsService.getMonthlyTrend(req.user!, months ?? 6);
    return sendList(res, monthly, { total: monthly.length });
  },
);

analyticsRouter.get('/materials', async (req, res) => {
  const materials = await analyticsService.getMaterialRecovery(req.user!);
  return sendList(res, materials, { total: materials.length });
});

analyticsRouter.get('/categories', async (req, res) => {
  const mix = await analyticsService.getCategoryMix(req.user!, 12);
  return sendList(res, mix, { total: mix.length });
});

analyticsRouter.get('/centers', requireRole('ADMIN', 'CENTER_STAFF'), async (_req, res) => {
  const performance = await analyticsService.getCenterPerformance();
  return sendList(res, performance, { total: performance.length });
});

analyticsRouter.get('/agents', requireAdmin, async (_req, res) => {
  const performance = await analyticsService.getAgentPerformance();
  return sendList(res, performance, { total: performance.length });
});

analyticsRouter.get('/recyclers', requireRole('ADMIN', 'CENTER_STAFF'), async (_req, res) => {
  const performance = await analyticsService.getRecyclerPerformance();
  return sendList(res, performance, { total: performance.length });
});

analyticsRouter.get('/assignments', requireAdmin, async (_req, res) => {
  const stats = await analyticsService.getAssignmentStats();
  return sendData(res, stats);
});

analyticsRouter.get('/cycle-times', requireAdmin, async (_req, res) => {
  const timings = await analyticsService.getCycleTimes();
  return sendList(res, timings, { total: timings.length });
});

analyticsRouter.get('/recent-activity', requireAdmin, async (_req, res) => {
  const activity = await analyticsService.recentActivity(25);
  return sendList(res, activity, { total: activity.length });
});

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

/** Single role-appropriate payload for the landing screen of every role. */
dashboardRouter.get('/', async (req, res) => {
  const dashboard = await dashboardService.getDashboard(req.user!);
  return sendData(res, dashboard);
});

/**
 * Scoped activity feed. Administrators see the whole platform; every other role sees the
 * events they are allowed to see (their items, their pickups, their centre, their batches).
 */
export const activityRouter = Router();
activityRouter.use(authenticate);

activityRouter.get(
  '/',
  validate({ query: z.object({ page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(100).optional() }) }),
  async (req, res) => {
    const user = req.user!;
    const pagination = parsePagination(req.query, { limit: 25, maxLimit: 100 });

    const scope: Prisma.StatusHistoryWhereInput =
      user.role === 'ADMIN'
        ? {}
        : user.role === 'USER'
          ? { OR: [{ item: { userId: user.id } }, { pickupRequest: { userId: user.id } }] }
          : user.role === 'COLLECTION_AGENT'
            ? { OR: [{ actorId: user.id }, { pickupRequest: { agentId: user.agentProfileId ?? -1 } }] }
            : user.role === 'CENTER_STAFF'
              ? {
                  OR: [
                    { actorId: user.id },
                    { pickupRequest: { centerId: user.staffedCenterId ?? -1 } },
                    { item: { centerId: user.staffedCenterId ?? -1 } },
                    { batch: { centerId: user.staffedCenterId ?? -1 } },
                  ],
                }
              : { OR: [{ actorId: user.id }, { batch: { recyclerId: user.id } }] };

    const [rows, total] = await Promise.all([
      prisma.statusHistory.findMany({
        where: scope,
        include: { actor: { select: { id: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.statusHistory.count({ where: scope }),
    ]);

    return sendList(
      res,
      rows.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        status: row.status,
        note: row.note,
        createdAt: row.createdAt,
        actor: row.actor,
      })),
      buildPaginationMeta(total, pagination),
    );
  },
);
