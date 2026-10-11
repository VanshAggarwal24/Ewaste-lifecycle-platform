import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimit';
import { sendCreated, sendData, sendMessage } from '../utils/http';
import * as authService from '../services/auth.service';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../schemas/auth.schema';

/**
 * Authentication routes.
 *
 * `/register` and `/login` are the only unauthenticated endpoints in the API, and both sit
 * behind `authLimiter` (which counts failed attempts only). Registration can create nothing
 * but a USER account — see auth.service.register.
 */
export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  async (req, res) => {
    const result = await authService.register(req.body);
    return sendCreated(res, result);
  },
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  async (req, res) => {
    const result = await authService.login(req.body, { ip: req.ip });
    return sendData(res, { token: result.token, user: result.user });
  },
);

authRouter.get('/me', authenticate, async (req, res) => {
  const user = await authService.getPublicUser(req.user!.id);
  return sendData(res, { user });
});

authRouter.patch(
  '/me',
  authenticate,
  validate({ body: updateProfileSchema }),
  async (req, res) => {
    const user = await authService.updateOwnProfile(req.user!.id, req.body);
    return sendData(res, { user });
  },
);

authRouter.post(
  '/change-password',
  authenticate,
  authLimiter,
  validate({ body: changePasswordSchema }),
  async (req, res) => {
    const result = await authService.changeOwnPassword(req.user!.id, req.body);
    return sendMessage(res, result.message);
  },
);
