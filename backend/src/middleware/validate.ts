import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ValidationError } from '../lib/errors';

/**
 * Server-side request validation with Zod.
 *
 * Nothing reaches a service unless it matched the declared schema, so business code can
 * assume well-formed input and every rejection produces the same error contract:
 *
 *   422 { code: 'VALIDATION_ERROR', message, details: [{ field, message }] }
 *
 * Implementation note: in Express 5 `req.query` is a getter-only accessor, so validated
 * query values are attached to `req.validatedQuery` instead of being written back.
 */

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function issuesToDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        (req as Request & { validatedParams: unknown }).validatedParams = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        (req as Request & { validatedQuery: unknown }).validatedQuery = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        // `req.body` is writable in Express 5 — the parsed (and coerced) value replaces
        // the raw payload so downstream code sees canonical types.
        req.body = schemas.body.parse(req.body ?? {});
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ValidationError('Request validation failed', {
            issues: issuesToDetails(error),
          }),
        );
        return;
      }
      next(error);
    }
  };
}

/** Typed accessor for values produced by `validate({ query })`. */
export function validatedQuery<T>(req: Request): T {
  return ((req as Request & { validatedQuery?: unknown }).validatedQuery ?? req.query) as T;
}

/** Typed accessor for values produced by `validate({ params })`. */
export function validatedParams<T>(req: Request): T {
  return ((req as Request & { validatedParams?: unknown }).validatedParams ?? req.params) as T;
}
