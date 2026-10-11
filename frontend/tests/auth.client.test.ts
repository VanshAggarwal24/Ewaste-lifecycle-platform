import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, getStoredToken, setStoredToken } from '@/api/client';

/**
 * Session-storage regression tests for the API client.
 *
 * The preview runs the app inside a sandboxed iframe (`sandbox="allow-scripts"`, i.e. an
 * opaque origin). In that context *any* access to `window.localStorage` throws a
 * `SecurityError`, exactly like Safari in private mode. The client used to read the token
 * only from `localStorage` and swallow that error, so a freshly signed-in user sent every
 * protected request without an `Authorization` header and the API answered
 * `401 Missing bearer token` — the bug this suite pins down.
 */

/** jsdom exposes `localStorage` on the window; capture the descriptor so it can be restored. */
function storageDescriptor(): { target: object; descriptor: PropertyDescriptor } {
  let target: object | null = window;
  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, 'localStorage');
    if (descriptor) return { target, descriptor };
    target = Object.getPrototypeOf(target) as object | null;
  }
  throw new Error('Could not find a localStorage descriptor on the jsdom window');
}

const originalStorage = storageDescriptor();

/** Makes `window.localStorage` throw on access, like a sandboxed iframe does. */
function blockStorage(): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    },
  });
}

function restoreStorage(): void {
  Object.defineProperty(window, 'localStorage', originalStorage.descriptor);
}

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/** Stubs `fetch`, records every request and replies with the supplied response factory. */
function stubFetch(respond: (request: RecordedRequest) => { status: number; body?: unknown }) {
  const requests: RecordedRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: RecordedRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    requests.push(request);
    const { status, body } = respond(request);
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return requests;
}

beforeEach(() => {
  restoreStorage();
  window.localStorage.clear();
  setStoredToken(null);
});

afterEach(() => {
  restoreStorage();
  vi.unstubAllGlobals();
});

describe('token storage', () => {
  it('remembers the token in memory when Web Storage is blocked', () => {
    blockStorage();
    setStoredToken('tok-memory-only');
    expect(getStoredToken()).toBe('tok-memory-only');
  });

  it('still reads and writes Web Storage when it is available', () => {
    setStoredToken('tok-persisted');
    expect(window.localStorage.getItem('ecocycle.token')).toBe('tok-persisted');
    expect(getStoredToken()).toBe('tok-persisted');
  });

  it('clears a stale token from both memory and storage', () => {
    setStoredToken('tok-old');
    setStoredToken(null);
    expect(getStoredToken()).toBeNull();
    expect(window.localStorage.getItem('ecocycle.token')).toBeNull();
  });
});

describe('authenticated requests', () => {
  it('attaches Authorization: Bearer <token> when Web Storage is blocked', async () => {
    blockStorage();
    setStoredToken('tok-memory-only');

    const requests = stubFetch(() => ({ status: 200, body: { data: { ok: true } } }));
    await apiGet('/api/dashboard');

    expect(requests).toHaveLength(1);
    expect(requests[0].headers.Authorization).toBe('Bearer tok-memory-only');
  });

  it('attaches the header on every request, not just the first', async () => {
    blockStorage();
    setStoredToken('tok-memory-only');

    const requests = stubFetch(() => ({ status: 200, body: { data: { ok: true } } }));
    await apiGet('/api/dashboard');
    await apiGet('/api/items');
    await apiGet('/api/analytics/summary');

    expect(requests.map((request) => request.headers.Authorization)).toEqual([
      'Bearer tok-memory-only',
      'Bearer tok-memory-only',
      'Bearer tok-memory-only',
    ]);
  });

  it('omits the header when there is no session at all', async () => {
    blockStorage();
    const requests = stubFetch(() => ({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } } }));

    await expect(apiGet('/api/dashboard')).rejects.toBeInstanceOf(ApiError);
    expect(requests[0].headers.Authorization).toBeUndefined();
  });
});
