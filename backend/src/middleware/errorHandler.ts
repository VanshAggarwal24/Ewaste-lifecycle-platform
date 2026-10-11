import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { isProduction } from '../config/env';

/**
 * Centralised error handling — the single place where an exception becomes an HTTP
 * response. Route handlers therefore never build error payloads themselves.
 *
 * Error contract (stable for all clients):
 *   { error: { code, message, details? } }
 *
 * Internal details (stack traces, SQL, driver messages) are logged server-side and are
 * never returned when NODE_ENV=production.
 */

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
}

/** Postgres trigger / CHECK violations surfaced through Prisma. */
function mapDatabaseConstraint(message: string): AppError | null {
  // Our migrations RAISE EXCEPTION with human-readable messages; those are safe to expose
  // because they describe a domain invariant, not an internal implementation detail.
  const triggerMatch = /^error: (.+)$/im.exec(message);
  if (triggerMatch && /(check_violation|invariant|append-only|cannot change role|profile requires role|does not exist)/i.test(message)) {
    return new AppError(409, 'CONFLICT', triggerMatch[1].trim());
  }
  return null;
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';

  // 1. Explicit application errors.
  if (error instanceof AppError) {
    if (error.statusCode >= 500) logger.error(`[${requestId}] ${error.code}: ${error.message}`, error.details);
    else logger.debug(`[${requestId}] ${error.code}: ${error.message}`);
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  // 2. Validation errors that escaped the `validate` middleware.
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          issues: error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
        },
      },
    });
    return;
  }

  // 3. Malformed JSON body (thrown by express.json).
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' },
    });
    return;
  }

  // 4. Prisma / database errors.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | string | undefined) ?? 'field';
        const fields = Array.isArray(target) ? target.join(', ') : String(target);
        res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: `A record with this ${fields} already exists`,
            details: { fields },
          },
        });
        return;
      }
      case 'P2003': {
        res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: 'This operation references a related record that does not exist or is still in use',
          },
        });
        return;
      }
      case 'P2025': {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'The requested record does not exist' },
        });
        return;
      }
      case 'P2034': {
        // Write conflict / deadlock — the transaction was rolled back by PostgreSQL.
        res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: 'The record was modified concurrently. Please retry the operation.',
          },
        });
        return;
      }
      default: {
        logger.error(`[${requestId}] Prisma error ${error.code}`, { message: error.message, meta: error.meta });
        break;
      }
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'The request could not be applied to the data model' },
    });
    return;
  }

  // 5. Database CHECK / trigger violations raised as generic driver errors.
  if (error instanceof Error) {
    const mapped = mapDatabaseConstraint(error.message);
    if (mapped) {
      res.status(mapped.statusCode).json({
        error: { code: mapped.code, message: mapped.message },
      });
      return;
    }
  }

  // 6. Anything else is an unexpected bug.
  logger.error(`[${requestId}] Unhandled error on ${req.method} ${req.originalUrl}`, error);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction
        ? 'An unexpected error occurred. Please try again later.'
        : error instanceof Error
          ? error.message
          : 'Unknown error',
    },
  });
}
