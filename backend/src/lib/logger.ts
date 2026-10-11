import { env, isTest } from '../config/env';

/**
 * Minimal structured logger.
 *
 * Deliberately dependency-free: the API only needs levelled, timestamped console output.
 * Sensitive values (tokens, hashes, connection strings) are never passed in here — call
 * sites log identifiers and statuses only.
 */

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[(env.LOG_LEVEL as Level) ?? 'info'] ?? 3;

function emit(level: Exclude<Level, 'silent'>, message: string, meta?: unknown) {
  if (isTest && level !== 'error') return;
  if (LEVELS[level] > threshold) return;

  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}`;
  const stream = level === 'error' ? console.error : console.log;
  if (meta !== undefined) stream(line, meta);
  else stream(line);
}

export const logger = {
  error: (message: string, meta?: unknown) => emit('error', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
};
