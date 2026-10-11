import { Router } from 'express';
import { authRouter } from './auth.routes';
import { userRouter } from './user.routes';
import { centerRouter, categoryRouter } from './catalog.routes';
import { itemRouter } from './item.routes';
import { pickupRouter } from './pickup.routes';
import { batchRouter, recoveryRouter } from './batch.routes';
import {
  activityRouter,
  analyticsRouter,
  dashboardRouter,
  inspectionRouter,
} from './insights.routes';

/**
 * API surface, version-agnostic root (`/api`).
 *
 *   /api/auth          register, login, profile, password
 *   /api/users         admin user management + agent/recycler directories
 *   /api/centers       collection centres
 *   /api/categories    e-waste categories
 *   /api/items         e-waste items, submission, inspection trigger, timeline
 *   /api/pickups       pickup lifecycle + assignment
 *   /api/batches       processing batches
 *   /api/recoveries    material recovery records
 *   /api/inspections   inspection records (centre staff)
 *   /api/analytics     database-backed metrics
 *   /api/dashboard     role-specific landing payload
 *   /api/activity      scoped lifecycle event feed
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/centers', centerRouter);
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/items', itemRouter);
apiRouter.use('/pickups', pickupRouter);
apiRouter.use('/batches', batchRouter);
apiRouter.use('/recoveries', recoveryRouter);
apiRouter.use('/inspections', inspectionRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/activity', activityRouter);
