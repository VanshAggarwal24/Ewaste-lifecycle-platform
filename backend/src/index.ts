import { createApp } from './app';
import { databaseUrl, env, isProduction } from './config/env';
import { logger } from './lib/logger';
import { disconnectPrisma, prisma } from './lib/prisma';

/**
 * Server bootstrap.
 *
 * Startup deliberately does NOT create, reset, drop or migrate the database. Schema changes
 * are applied by the operator with `npx prisma migrate deploy` (see README). If the schema
 * is missing, startup fails with an instruction rather than silently altering data.
 */
async function start(): Promise<void> {
  const app = createApp();

  // Fail fast with an actionable message when the database is unreachable or unmigrated.
  try {
    await prisma.$queryRaw`SELECT 1 FROM "users" LIMIT 1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Database pre-flight check failed.');
    logger.error(`  Connection : ${databaseUrl.replace(/:\/\/[^@]*@/, '://***:***@')}`);
    logger.error(`  Error      : ${message}`);
    logger.error('  Checklist  :');
    logger.error('    1. Is PostgreSQL running?');
    logger.error('    2. Does DATABASE_URL in backend/.env point at the right database?');
    logger.error('    3. Have the migrations been applied?  ->  npx prisma migrate deploy');
    logger.error('    4. Optional demo data:                ->  npm run db:seed');
    process.exit(1);
  }

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`EcoCycle API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    logger.info(`Health check: http://localhost:${env.PORT}/api/health`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectPrisma();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Do not hang forever if a connection refuses to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception — exiting', error);
    process.exit(1);
  });
}

void start();

export { isProduction };
