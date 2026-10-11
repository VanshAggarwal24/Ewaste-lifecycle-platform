/**
 * Runs before each test file (after the test framework is installed).
 *
 * Environment is pinned here so that behaviour is identical whether the suite is run
 * directly or through npm scripts:
 *   - NODE_ENV=test selects TEST_DATABASE_URL and silences request logging.
 *   - bcrypt cost is reduced: the suite hashes dozens of passwords, and a low cost factor is
 *     the standard way to keep API-level tests fast. Production keeps the configured cost.
 *   - the rate limiter stays ENABLED (its dedicated test asserts real 429 behaviour) but the
 *     window is short so the suite is not slowed down by long windows.
 */
process.env.NODE_ENV = 'test';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.LOG_LEVEL = 'silent';
process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS ?? '20';

// A token used by the whole suite. Set before any module reads the configuration.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-suite-secret-value-should-be-long-enough';

jest.setTimeout(30_000);

afterAll(async () => {
  // Close the connection pool so Jest can exit cleanly.
  const { prisma } = await import('../../src/lib/prisma');
  await prisma.$disconnect();
});
