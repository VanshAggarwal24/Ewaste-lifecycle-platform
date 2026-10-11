import { Router } from 'express';
import { authenticate, requireAdmin, requireRole } from '../middleware/auth';
import { validate, validatedParams, validatedQuery } from '../middleware/validate';
import { buildPaginationMeta, parsePagination, sendCreated, sendData, sendList, sendMessage } from '../utils/http';
import { idParamSchema } from '../schemas/common.schema';
import {
  createUserSchema,
  listUsersQuerySchema,
  resetUserPasswordSchema,
  updateAgentProfileSchema,
  updateRecyclerProfileSchema,
  updateUserSchema,
  type ListUsersQuery,
} from '../schemas/user.schema';
import * as userService from '../services/user.service';
import { z } from 'zod';

/**
 * User administration + agent/recycler directories.
 *
 * This router is where privileged accounts are created. The whole router sits behind
 * `authenticate`; individual routes then apply `requireAdmin`, except the read-only
 * directories used by coordinators when assigning work.
 */
export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get(
  '/agents',
  requireRole('ADMIN', 'CENTER_STAFF'),
  validate({
    query: z.object({
      centerId: z.coerce.number().int().positive().optional(),
      onlyAvailable: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    }),
  }),
  async (req, res) => {
    const query = validatedQuery<{ centerId?: number; onlyAvailable?: boolean }>(req);
    const agents = await userService.listAgents(query);
    return sendList(res, agents, { total: agents.length });
  },
);

userRouter.get(
  '/recyclers',
  requireRole('ADMIN', 'CENTER_STAFF'),
  validate({
    query: z.object({
      onlyActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    }),
  }),
  async (req, res) => {
    const query = validatedQuery<{ onlyActive?: boolean }>(req);
    const recyclers = await userService.listRecyclers(query);
    return sendList(res, recyclers, { total: recyclers.length });
  },
);

userRouter.get(
  '/',
  requireAdmin,
  validate({ query: listUsersQuerySchema }),
  async (req, res) => {
    const query = validatedQuery<ListUsersQuery>(req);
    const pagination = parsePagination(req.query, { limit: 20 });
    const { users, total } = await userService.listUsers(query);
    return sendList(res, users, buildPaginationMeta(total, pagination));
  },
);

userRouter.post(
  '/',
  requireAdmin,
  validate({ body: createUserSchema }),
  async (req, res) => {
    const user = await userService.createUser(req.body, req.user!.id);
    return sendCreated(res, { user });
  },
);

userRouter.patch(
  '/agents/:id',
  requireAdmin,
  validate({ params: idParamSchema, body: updateAgentProfileSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const profile = await userService.updateAgentProfile(id, req.body);
    return sendData(res, { agentProfile: profile });
  },
);

userRouter.patch(
  '/recyclers/:id',
  requireAdmin,
  validate({ params: idParamSchema, body: updateRecyclerProfileSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const profile = await userService.updateRecyclerProfile(id, req.body);
    return sendData(res, { recyclerProfile: profile });
  },
);

userRouter.get(
  '/:id',
  requireAdmin,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const user = await userService.getUserDetail(id);
    return sendData(res, { user });
  },
);

userRouter.patch(
  '/:id',
  requireAdmin,
  validate({ params: idParamSchema, body: updateUserSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const user = await userService.updateUser(id, req.body, req.user!);
    return sendData(res, { user });
  },
);

userRouter.post(
  '/:id/reset-password',
  requireAdmin,
  validate({ params: idParamSchema, body: resetUserPasswordSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const result = await userService.resetUserPassword(id, req.body.newPassword);
    return sendMessage(res, result.message);
  },
);

userRouter.post(
  '/:id/suspend',
  requireAdmin,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const user = await userService.suspendUser(id, req.user!.id);
    return sendData(res, { user });
  },
);

userRouter.post(
  '/:id/activate',
  requireAdmin,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const user = await userService.activateUser(id);
    return sendData(res, { user });
  },
);

userRouter.delete(
  '/:id',
  requireAdmin,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = validatedParams<{ id: number }>(req);
    const result = await userService.deleteUser(id, req.user!.id);
    return sendMessage(res, result.message);
  },
);
