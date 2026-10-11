import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthenticatedError } from '../lib/errors';
import type { Role } from '@prisma/client';

/**
 * JWT issuing and verification.
 *
 * Tokens carry only non-sensitive claims (subject, role, e-mail). Password hashes and
 * any other secret material are never embedded in a token, and the signing secret is
 * read from the environment only.
 */

export interface AuthTokenPayload extends JwtPayload {
  sub: string; // user id
  role: Role;
  email: string;
}

export function signAuthToken(user: { id: number; role: Role; email: string }): string {
  const payload: Omit<AuthTokenPayload, 'iat' | 'exp'> = {
    sub: String(user.id),
    role: user.role,
    email: user.email,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

/** Verifies signature + expiry. Throws `UnauthenticatedError` for any failure. */
export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded === 'string' || !decoded.sub) {
      throw new UnauthenticatedError('Malformed authentication token');
    }

    return decoded as AuthTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthenticatedError('Session expired — please sign in again');
    }
    if (error instanceof UnauthenticatedError) {
      throw error;
    }
    throw new UnauthenticatedError('Invalid authentication token');
  }
}

/** Extracts the raw token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}
