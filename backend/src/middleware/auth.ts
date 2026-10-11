import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, UnauthenticatedError } from '../lib/errors';
import { extractBearerToken, verifyAuthToken } from '../utils/jwt';

/**
 * Authentication & authorisation.
 *
 * `authenticate` verifies the JWT *and* re-reads the user from the database on every
 * request. That costs one indexed primary-key lookup and buys three guarantees:
 *   1. a suspended account loses access immediately (no waiting for token expiry);
 *   2. a role change takes effect immediately;
 *   3. deleted users cannot keep acting with a stale token.
 *
 * `requireRole` then performs the coarse role gate. Fine-grained authorisation
 * (ownership, centre membership, batch ownership) lives in the service layer, where it
 * runs inside the same transaction as the write it protects.
 */

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED';
  staffedCenterId: number | null;
  agentProfileId: number | null;
  recyclerProfileId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId: string;
    }
  }
}

function toAuthUser(user: {
  id: number;
  email: string;
  role: Role;
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED';
  staffedCenterId: number | null;
  agentProfile: { id: number } | null;
  recyclerProfile: { id: number } | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    status: user.status,
    staffedCenterId: user.staffedCenterId,
    agentProfileId: user.agentProfile?.id ?? null,
    recyclerProfileId: user.recyclerProfile?.id ?? null,
  };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) throw new UnauthenticatedError('Missing bearer token');

    const payload = verifyAuthToken(token);
    const userId = Number.parseInt(payload.sub, 10);
    if (!Number.isFinite(userId)) throw new UnauthenticatedError('Malformed token subject');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        status: true,
        staffedCenterId: true,
        agentProfile: { select: { id: true } },
        recyclerProfile: { select: { id: true } },
      },
    });

    if (!user) throw new UnauthenticatedError('Account no longer exists');
    if (user.status === 'SUSPENDED') throw new ForbiddenError('This account has been suspended');

    req.user = toAuthUser(user);
    next();
  } catch (error) {
    next(error);
  }
}

/** Role gate. Must be used after `authenticate`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthenticatedError());
    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `This action requires one of the following roles: ${roles.join(', ')}. Your role is ${req.user.role}.`,
        ),
      );
    }
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireStaffOrAdmin = requireRole('CENTER_STAFF', 'ADMIN');
export const requireAgent = requireRole('COLLECTION_AGENT');
export const requireRecycler = requireRole('RECYCLER');

/**
 * Ownership guard for resources that belong to exactly one user.
 * Admins bypass it; everybody else may only touch their own rows.
 */
export function assertOwnershipOrAdmin(
  actor: AuthUser,
  ownerId: number,
  resourceLabel = 'resource',
): void {
  if (actor.role === 'ADMIN') return;
  if (actor.id !== ownerId) {
    // Deliberately a 403 with no hint about the record's contents.
    throw new ForbiddenError(`You may only access your own ${resourceLabel}`);
  }
}
