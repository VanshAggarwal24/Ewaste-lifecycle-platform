import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env, isTest } from '../config/env';
import { RateLimitError } from '../lib/errors';

/**
 * Rate limiting.
 *
 * Two limiters are applied:
 *  - `authLimiter`  : strict, counts only *failed* attempts, protects credential
 *                     endpoints against brute force / password spraying.
 *  - `apiLimiter`   : broad safety net for the whole API surface.
 *
 * Both are disabled when DISABLE_RATE_LIMIT=true (used by the test suite so that a few
 * hundred rapid assertions do not trip the limiter) and honour the standard
 * `RateLimit-*` headers for well-behaved clients.
 */

/**
 * The limiters are skipped when DISABLE_RATE_LIMIT=true (documented deployment switch) and,
 * inside the test environment, unless a suite explicitly opts in by setting
 * TEST_FORCE_RATE_LIMIT=true. That opt-in exists so the dedicated rate-limit test can still
 * exercise the real 429 response without every other assertion racing against the counter.
 */
function shouldSkip(): boolean {
  if (env.DISABLE_RATE_LIMIT) return true;
  if (isTest && process.env.TEST_FORCE_RATE_LIMIT !== 'true') return true;
  return false;
}

function buildOptions(overrides: Partial<Options>): Partial<Options> {
  return {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // `trustProxy` checks are handled by app.set('trust proxy') in app.ts.
    validate: { xForwardedForHeader: false, trustProxy: false },
    handler: (_req: Request, res: Response) => {
      const error = new RateLimitError();
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    },
    ...overrides,
  };
}

export const authLimiter = rateLimit(
  buildOptions({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: env.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
    // Successful logins do not consume budget — only failures count toward the limit.
    skipSuccessfulRequests: true,
    skip: shouldSkip,
  }),
);

export const apiLimiter = rateLimit(
  buildOptions({
    windowMs: env.API_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: env.API_RATE_LIMIT_MAX_REQUESTS,
    skip: shouldSkip,
  }),
);
