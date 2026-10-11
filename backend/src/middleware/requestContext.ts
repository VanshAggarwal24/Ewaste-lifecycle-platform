import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Attaches a correlation id to every request. The id is echoed in the `X-Request-Id`
 * response header and included in error logs, so a user-reported failure can be traced to
 * the exact server-side log lines without exposing internals to the client.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 100
    ? incoming
    : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
