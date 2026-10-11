import { Prisma, PrismaClient } from '@prisma/client';
import { databaseUrl, isProduction, isTest } from '../config/env';

/**
 * Single PrismaClient instance for the whole process.
 *
 * Note: the application *never* drops or resets the database on startup. Schema
 * changes are applied exclusively through versioned migrations
 * (`npx prisma migrate deploy`) run by the operator, not by the server.
 */

declare global {
  // eslint-disable-next-line no-var
  var __ecocyclePrisma: PrismaClient | undefined;
}

function createClient() {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: isTest
      ? []
      : isProduction
        ? [{ emit: 'event', level: 'error' }]
        : [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }],
  });
}

export const prisma = global.__ecocyclePrisma ?? createClient();

if (!isProduction) {
  // Reuse the client across ts-node/tsx hot reloads during development.
  global.__ecocyclePrisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/** Convenience alias so services read naturally: `type Tx = Prisma.TransactionClient`. */
export type Tx = Prisma.TransactionClient;

export { Prisma };
