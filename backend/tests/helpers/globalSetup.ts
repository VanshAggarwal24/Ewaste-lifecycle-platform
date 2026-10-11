import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Jest globalSetup — runs once before the whole suite, in its own process.
 *
 * Applies the versioned migrations to the *test* database so the suite always runs against
 * the real schema (including CHECK constraints, triggers, sequences and indexes).
 *
 * Safety: this process only ever touches TEST_DATABASE_URL. If it is missing, the setup
 * aborts rather than risking the development database.
 */
export default async function globalSetup(): Promise<void> {
  const backendRoot = path.resolve(__dirname, '../..');
  dotenv.config({ path: path.join(backendRoot, '.env') });

  const testUrl = process.env.TEST_DATABASE_URL;

  if (!testUrl) {
    throw new Error(
      '\n✖ TEST_DATABASE_URL is not set.\n' +
        '  Add it to backend/.env (see .env.example). The test suite never uses DATABASE_URL.\n',
    );
  }

  if (testUrl === process.env.DATABASE_URL) {
    throw new Error(
      '\n✖ TEST_DATABASE_URL must point at a different database than DATABASE_URL.\n' +
        '  The suite truncates its tables between tests, so it must never share a database with development data.\n',
    );
  }

  process.env.NODE_ENV = 'test';

  try {
    execSync('npx prisma migrate deploy', {
      cwd: backendRoot,
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test' },
    });
  } catch (error) {
    const output = error instanceof Error && 'stdout' in error ? String((error as { stdout: Buffer }).stdout) : '';
    const stderr = error instanceof Error && 'stderr' in error ? String((error as { stderr: Buffer }).stderr) : '';

    throw new Error(
      '\n✖ Could not apply migrations to the test database.\n' +
        `  TEST_DATABASE_URL: ${testUrl.replace(/:\/\/[^@]*@/, '://***:***@')}\n\n` +
        '  Create the database first, then re-run the tests:\n' +
        '    psql -U postgres -c "CREATE DATABASE ecocycle_test;"        (or: createdb ecocycle_test)\n' +
        '    npx prisma migrate deploy                                    (with DATABASE_URL pointing at it)\n\n' +
        `  CLI output:\n${output}\n${stderr}\n`,
    );
  }

  // Make the chosen connection string visible to every test process.
  process.env.DATABASE_URL = testUrl;
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_RATE_LIMIT = 'false';
  process.env.BCRYPT_SALT_ROUNDS = process.env.BCRYPT_SALT_ROUNDS ?? '4';
}
