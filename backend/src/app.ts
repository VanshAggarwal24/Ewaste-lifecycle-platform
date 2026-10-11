import express, { type Express } from 'express';
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
  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      // Requests without an Origin header (curl, server-to-server, same-origin proxies)
      // are always allowed: CORS is a browser control, not an authentication mechanism.
      if (!origin) return callback(null, true);

      if (corsOrigins.includes(origin)) return callback(null, true);

      if (!isProduction) {
        // Developer convenience for local tooling and sandbox preview hosts. Never enabled
        // in production, where only CORS_ORIGINS is honoured.
        try {
          const hostname = new URL(origin).hostname;
          if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.endsWith('.localhost') ||
            hostname.endsWith('.e2b.app')
          ) {
            return callback(null, true);
          }
        } catch {
          /* fall through to rejection */
        }
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    maxAge: 600,
  };

  app.use(cors(corsOptions));

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
