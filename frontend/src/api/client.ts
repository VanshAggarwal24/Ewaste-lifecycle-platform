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

/**
 * The token used for the lifetime of the page, kept in memory first.
 *
 * Web Storage is *not* always available: a sandboxed iframe (`sandbox="allow-scripts"` gives
 * the document an opaque origin), Safari in private mode and some embedded webviews throw a
 * `SecurityError` on any `window.localStorage` access. Reading the token exclusively from
 * storage meant that in those environments a signed-in user sent every request without an
 * `Authorization` header, and the API — quite correctly — answered
 * `401 Missing bearer token` even though the sign-in had just succeeded.
 *
 * Memory is therefore the source of truth, and storage is a best-effort persistence layer
 * that lets a page reload restore the session when it is available.
 */
let memoryToken: string | null = null;
let persistenceAvailable: boolean | null = null;

function readPersistedToken(): string | null {
  try {
    const persisted = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    persistenceAvailable = true;
    return persisted;
  } catch {
    persistenceAvailable = false;
    return null;
  }
}

function persistToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    persistenceAvailable = true;
  } catch {
    // Storage blocked or full: the session still works for this page load, it just cannot
    // survive a reload. `isSessionPersistenceAvailable()` lets the UI say so.
    persistenceAvailable = false;
  }
}

export function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  const persisted = readPersistedToken();
  if (persisted) memoryToken = persisted;
  return memoryToken;
}

export function setStoredToken(token: string | null): void {
  const next = token?.trim() ? token.trim() : null;
  memoryToken = next;
  persistToken(next);
}

/**
 * `false` when the browser refuses Web Storage access, meaning the signed-in session cannot
 * survive a page reload in this context. `true` once a read or write has succeeded.
 */
export function isSessionPersistenceAvailable(): boolean {
  if (persistenceAvailable === null) readPersistedToken();
  return persistenceAvailable === true;
}

/**
 * Called when a request was rejected as unauthenticated, together with the token that the
 * request carried. The handler receives the token on purpose: a response can land *after* the
 * visitor has signed in again, and a rejection that belongs to an older token must not end the
 * session that replaced it.
 */
type UnauthorizedHandler = (error: ApiError, failedToken: string | null) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Registers the reaction to a request that the API rejected as unauthenticated. The auth
 * layer uses it to drop the dead session so the router can send the user back to the login
 * screen instead of leaving an error panel on a protected page.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
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

    const status = response.status;
    const code = errorBody?.code ?? 'HTTP_ERROR';
    const apiError = new ApiError(
      status,
      code,
      errorBody?.message ?? `Request failed with status ${status}`,
      errorBody?.details,
    );

    // A `401` on anything other than the credential entry points means the session is gone
    // (expired token, deleted or suspended account) or was never attached. Drop the token and
    // let the app return to the login screen. `INVALID_CREDENTIALS` is excluded: that is a
    // wrong password on /auth/login or /auth/change-password, not a broken session.
    const isSessionFailure =
      status === 401 && (code === 'UNAUTHENTICATED' || code === 'TOKEN_EXPIRED' || code === 'HTTP_ERROR');

    if (isSessionFailure) {
      if (unauthorizedHandler) {
        // The handler decides what to do, and it needs to compare the refused token with the
        // current one *before* anything is cleared — a newer session may already have
        // replaced it while this response was travelling.
        unauthorizedHandler(apiError, token);
      } else if (token && getStoredToken() === token) {
        // No session manager mounted (scripts, smoke tests): drop the dead token.
        setStoredToken(null);
      }
    }

    throw apiError;
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
