import express, { type Express, type Request } from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOrigins, env, isProduction, isTest, publicConfig } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestContext } from './middleware/requestContext';
import { apiLimiter } from './middleware/rateLimit';

/**
 * Express application factory.
 *
 * The app is exported separately from the server bootstrap (`index.ts`) so the automated
 * test suite can drive the real HTTP stack with supertest without opening a port.
 */
/**
 * CORS policy.
 *
 * The web app is served from the Vite dev server (or a preview host) and calls the API with
 * relative URLs, so the rules below have to accommodate three real cases:
 *
 *   1. **No `Origin` header** — curl, server-to-server calls and same-origin GETs. Always fine.
 *   2. **Same origin as the request's own host** — the normal case for the dev server and for
 *      a single-origin deployment behind a reverse proxy. Same-origin requests are not subject
 *      to CORS at all, so allowing them cannot widen anything.
 *   3. **A sandboxed preview iframe** — `sandbox="allow-scripts"` gives the document an opaque
 *      origin, which browsers send as the literal `Origin: null`, and the preview hosts end in
 *      `*.e2b.app`. Both are allowed in development only.
 *
 * A disallowed origin is answered **normally, just without `Access-Control-Allow-Origin`**, so
 * the browser blocks the caller from reading the response. It is explicitly *not* an error:
 * throwing here made the API return `500 Internal Server Error` to an ordinary browser request
 * — including the sign-in POST, which the browser always sends with an `Origin` header. CORS is
 * a browser read control, never an authentication mechanism; the JWT does that job.
 */
function corsOptionsFor(req: Request): CorsOptions {
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      if (isSameOrigin(origin, req)) return callback(null, true);
      if (!isProduction && isDevelopmentOrigin(origin)) return callback(null, true);

      // Not allowed: no CORS headers (the browser blocks the read), and no error (the request
      // itself is answered normally).
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    maxAge: 600,
  };
}

function safeHostname(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** `true` when the origin's host is the host this request was addressed to. */
function isSameOrigin(origin: string, req: Request): boolean {
  const originHost = safeHostname(origin);
  if (!originHost) return false;

  const candidates = [req.get('host'), req.get('x-forwarded-host')]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return candidates.some((candidate) => {
    const host = candidate.replace(/:\d+$/, '');
    return candidate === originHost || host === originHost;
  });
}

/**
 * Development origins: localhost, the platform's preview hosts, and the opaque origin
 * (`null`) of a sandboxed preview iframe. Never applied in production, where only
 * `CORS_ORIGINS` is honoured.
 */
function isDevelopmentOrigin(origin: string): boolean {
  // A sandboxed iframe reports an opaque origin as the literal string "null".
  if (origin === 'null') return true;

  const hostname = safeHostname(origin);
  if (!hostname) return false;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.e2b.app')
  );
}

export function createApp(): Express {
  const app = express();

  // ---------------------------------------------------------------------------
  // Platform hardening
  // ---------------------------------------------------------------------------
  app.disable('x-powered-by');

  // Correct client IPs behind a reverse proxy (needed by the rate limiter). Off by
  // default: trusting X-Forwarded-For without a proxy in front lets clients spoof their IP.
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP costs nothing and blocks accidental
      // content sniffing if a browser is ever pointed at it directly.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // ---------------------------------------------------------------------------
  // CORS — explicit allow-list, configurable per environment
  // ---------------------------------------------------------------------------
  app.use(cors((req, callback) => callback(null, corsOptionsFor(req))));

  // ---------------------------------------------------------------------------
  // Request parsing & logging
  // ---------------------------------------------------------------------------
  app.use(requestContext);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  if (!isTest) {
    app.use(
      morgan(isProduction ? 'combined' : 'dev', {
        skip: (req) => req.path === '/api/health',
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Health & diagnostics (no secrets; safe to expose)
  // ---------------------------------------------------------------------------
  app.get('/api/health', async (_req, res) => {
    let database: 'up' | 'down' = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch (error) {
      logger.error('Health check database probe failed', error);
    }

    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'ecocycle-api',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      config: publicConfig(),
    });
  });

  // ---------------------------------------------------------------------------
  // Business API
  // ---------------------------------------------------------------------------
  app.use('/api', apiLimiter, apiRouter);

  // ---------------------------------------------------------------------------
  // Fallbacks — must be registered last, in this order
  // ---------------------------------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
