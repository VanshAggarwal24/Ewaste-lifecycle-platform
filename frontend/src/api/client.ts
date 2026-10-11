import type { Paginated } from './types';

/**
 * HTTP client.
 *
 * One place that knows how to talk to the API: it attaches the JWT, unwraps the response
 * envelope, converts every failure into a typed `ApiError` and clears the session when the
 * token is no longer valid.
 *
 * Base URL resolution:
 *   - `VITE_API_URL` when set (e.g. the API on a different host in production),
 *   - otherwise a relative `/api`, which the Vite dev server proxies to the backend. This
 *     keeps the browser on a single origin in development, so no CORS pre-flight occurs.
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const TOKEN_STORAGE_KEY = 'ecocycle.token';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level validation messages, ready to display next to inputs. */
  get fieldErrors(): Record<string, string> {
    const issues = (this.details as { issues?: { field: string; message: string }[] } | undefined)?.issues;
    if (!Array.isArray(issues)) return {};
    return Object.fromEntries(issues.map((issue) => [issue.field, issue.message]));
  }

  /** A single human-readable line for banners and toasts. */
  get displayMessage(): string {
    const fields = Object.entries(this.fieldErrors);
    if (fields.length === 0) return this.message;
    return `${this.message}: ${fields.map(([field, message]) => `${field} ${message}`).join(', ')}`;
  }
}

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode) — the session simply will not persist */
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

/**
 * Performs a request and returns the parsed body.
 * Throws `ApiError` for any non-2xx response, including network failures.
 */
async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getStoredToken();

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the EcoCycle API. Is the backend running on the configured port?',
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorBody = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;

    // An expired/invalid token must not leave a broken session behind.
    if (response.status === 401 && token) setStoredToken(null);

    throw new ApiError(
      response.status,
      errorBody?.code ?? 'HTTP_ERROR',
      errorBody?.message ?? `Request failed with status ${response.status}`,
      errorBody?.details,
    );
  }

  return payload as T;
}

/** Single resource: unwraps the `{ data }` envelope. */
export async function apiGet<T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal): Promise<T> {
  const body = await rawRequest<{ data: T }>(path, { query, signal });
  return body.data;
}

/** Collection: returns the `{ data, meta }` envelope untouched, so pages can paginate. */
export function apiGetList<T>(
  path: string,
  query?: RequestOptions['query'],
  signal?: AbortSignal,
): Promise<Paginated<T>> {
  return rawRequest<Paginated<T>>(path, { query, signal });
}

export async function apiPost<T>(path: string, body?: unknown, query?: RequestOptions['query']): Promise<T> {
  const response = await rawRequest<{ data: T }>(path, { method: 'POST', body, query });
  return response?.data;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await rawRequest<{ data: T }>(path, { method: 'PATCH', body });
  return response?.data;
}

export async function apiDelete<T>(path: string): Promise<T> {
  return rawRequest<T>(path, { method: 'DELETE' });
}

/** Message-only endpoints (`{ message }`) come back with no data envelope. */
export async function apiPostMessage(path: string, body?: unknown): Promise<string> {
  const response = await rawRequest<{ message?: string }>(path, { method: 'POST', body });
  return response?.message ?? 'Done';
}
