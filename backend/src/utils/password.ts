import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/**
 * Password hashing.
 *
 * bcrypt with a configurable cost factor. Plain-text passwords are never persisted,
 * logged, or included in any API response — only this module sees them, and only for
 * the duration of a single call.
 */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

/**
 * Constant-time-ish comparison provided by bcrypt itself.
 * Returns false (never throws) for malformed hashes so callers cannot probe internals.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

/**
 * Password policy: >= 8 chars, at least one letter and one digit.
 * Enforced server-side in addition to the client-side Zod rules.
 */
export function checkPasswordPolicy(plain: string): PasswordPolicyResult {
  const problems: string[] = [];
  if (plain.length < 8) problems.push('must be at least 8 characters long');
  if (plain.length > 128) problems.push('must be at most 128 characters long');
  if (!/[A-Za-z]/.test(plain)) problems.push('must contain at least one letter');
  if (!/[0-9]/.test(plain)) problems.push('must contain at least one digit');
  return { ok: problems.length === 0, problems };
}
