import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Central, validated configuration.
 *
 * Every environment variable is parsed and validated once at boot, so a
 * misconfigured deployment fails fast with a readable message instead of
 * throwing `undefined` deep inside a request handler.
 *
 * Secrets (JWT secret, database credentials) are never logged or returned by any
 * API response — `publicConfig()` exposes only non-sensitive values.
 */

// Load `.env` from the backend root regardless of the process working directory.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const booleanish = z
  .string()
  .transform((v) => ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

/** Treat empty strings as "unset" so `.env` files with blank optional lines work. */
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(4000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (see .env.example)'),
    TEST_DATABASE_URL: optionalString,

    JWT_SECRET: z
      .string()
      .min(16, 'JWT_SECRET must be at least 16 characters — generate a long random value'),
    JWT_EXPIRES_IN: z.string().default('8h'),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

    CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),

    AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(20),
    API_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
    API_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(600),

    // Rule-based assignment engine (see docs/ASSIGNMENT_ALGORITHM.md)
    ASSIGN_MAX_DISTANCE_KM: z.coerce.number().positive().default(50),
    ASSIGN_MAX_DAILY_PICKUPS: z.coerce.number().int().positive().default(10),
    ASSIGN_WEIGHT_DISTANCE: z.coerce.number().min(0).max(1).default(0.45),
    ASSIGN_WEIGHT_WORKLOAD: z.coerce.number().min(0).max(1).default(0.25),
    ASSIGN_WEIGHT_AVAILABILITY: z.coerce.number().min(0).max(1).default(0.2),
    ASSIGN_WEIGHT_CAPACITY: z.coerce.number().min(0).max(1).default(0.1),
    ASSIGN_CANDIDATE_POOL: z.coerce.number().int().min(1).max(100).default(10),

    LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
    TRUST_PROXY: booleanish.default('false'),
    DISABLE_RATE_LIMIT: booleanish.default('false'),
  })
  .transform((raw) => {
    const weights = {
      distance: raw.ASSIGN_WEIGHT_DISTANCE,
      workload: raw.ASSIGN_WEIGHT_WORKLOAD,
      availability: raw.ASSIGN_WEIGHT_AVAILABILITY,
      capacity: raw.ASSIGN_WEIGHT_CAPACITY,
    };
    const sum = weights.distance + weights.workload + weights.availability + weights.capacity;
    return { ...raw, ASSIGN_WEIGHTS: weights, ASSIGN_WEIGHT_SUM: sum };
  })
  .superRefine((raw, ctx) => {
    // A weighting scheme of all zeros cannot rank anything — refuse to start.
    if (raw.ASSIGN_WEIGHTS.distance +
        raw.ASSIGN_WEIGHTS.workload +
        raw.ASSIGN_WEIGHTS.availability +
        raw.ASSIGN_WEIGHTS.capacity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'At least one ASSIGN_WEIGHT_* value must be greater than zero, otherwise no candidate can be scored.',
      });
    }
    if (raw.NODE_ENV === 'production' && raw.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_SECRET must be at least 32 characters in production.',
      });
    }
    if (raw.NODE_ENV === 'production' && raw.DISABLE_RATE_LIMIT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DISABLE_RATE_LIMIT must not be enabled in production.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`);
    // Print to stderr and exit: an invalid configuration is not recoverable.
    console.error('\n✖ Invalid environment configuration:\n' + lines.join('\n') + '\n');
    console.error('  Copy backend/.env.example to backend/.env and fill in the values.\n');
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** The connection string actually used by Prisma in this process. */
export const databaseUrl = isTest && env.TEST_DATABASE_URL ? env.TEST_DATABASE_URL : env.DATABASE_URL;

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/** Normalised assignment weights (always sum to 1) used by the scoring engine. */
export function normalizedAssignmentWeights() {
  const w = env.ASSIGN_WEIGHTS;
  const sum = env.ASSIGN_WEIGHT_SUM || 1;
  return {
    distance: w.distance / sum,
    workload: w.workload / sum,
    availability: w.availability / sum,
    capacity: w.capacity / sum,
  };
}

/** Safe subset for diagnostics endpoints — contains no secrets. */
export function publicConfig() {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    corsOrigins,
    assignment: {
      maxDistanceKm: env.ASSIGN_MAX_DISTANCE_KM,
      maxDailyPickups: env.ASSIGN_MAX_DAILY_PICKUPS,
      weights: normalizedAssignmentWeights(),
      candidatePool: env.ASSIGN_CANDIDATE_POOL,
    },
  };
}
