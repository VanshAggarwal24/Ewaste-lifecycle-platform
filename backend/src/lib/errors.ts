/**
 * Centralised error model.
 *
 * Every failure raised by the application (or mapped from a library error) becomes an
 * `AppError` with a stable machine-readable `code`, an HTTP status and optional field
 * details. The error middleware serialises exactly this shape, so clients can rely on it.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_TRANSITION'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly expose: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    expose = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = 'Invalid email or password') {
    super(401, 'INVALID_CREDENTIALS', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', message?: string) {
    super(404, 'NOT_FOUND', message ?? `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The request conflicts with the current state of the resource', details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

/** A state-machine violation: the requested status change is not on the allowed edge list. */
export class InvalidTransitionError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'INVALID_TRANSITION', message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests — please slow down and try again later') {
    super(429, 'RATE_LIMITED', message);
  }
}

/** Small helpers that read well at call sites. */
export const unauthorized = (m?: string) => new UnauthenticatedError(m);
export const forbidden = (m?: string) => new ForbiddenError(m);
export const notFound = (r?: string, m?: string) => new NotFoundError(r, m);
export const conflict = (m?: string, d?: unknown) => new ConflictError(m, d);
export const badTransition = (m: string, d?: unknown) => new InvalidTransitionError(m, d);
