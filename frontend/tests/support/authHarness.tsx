import { vi } from 'vitest';
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '@/App';
import { AuthProvider } from '@/context/AuthContext';

/**
 * Shared harness for the authentication regression suites.
 *
 * The tests mount the **real** application (`App`, `AuthProvider`, the route guards and the
 * login page) against a stubbed `fetch`, and expose the current route so a test can assert
 * where the user actually ended up — which is the point of these suites.
 */

export interface RecordedRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface StubRoute {
  status: number;
  body?: unknown;
  /** Delay in milliseconds, used to reproduce responses landing after a change of session. */
  delayMs?: number;
}

export type StubRoutes = Record<string, StubRoute | ((request: RecordedRequest) => StubRoute)>;

/** Stubs `fetch` with a tiny router; records every request the application makes. */
export function stubApi(routes: StubRoutes): RecordedRequest[] {
  const requests: RecordedRequest[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      const request: RecordedRequest = {
        path,
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      requests.push(request);

      const entry = routes[path];
      if (!entry) {
        return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `No stub for ${path}` } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const resolved = typeof entry === 'function' ? entry(request) : entry;
      if (resolved.delayMs) await new Promise((resolve) => setTimeout(resolve, resolved.delayMs));

      if (resolved.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(resolved.body ?? {}), {
        status: resolved.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return requests;
}

/** `true` when `path` received at least one request carrying the given bearer token. */
export function tokenSentTo(requests: RecordedRequest[], path: string, token: string): boolean {
  return requests.some(
    (request) => request.path === path && request.headers.Authorization === `Bearer ${token}`,
  );
}

/**
 * jsdom exposes `localStorage` on the window; capture the descriptor so a test can make it
 * throw, exactly as a sandboxed iframe does, and restore it afterwards.
 */
export function storageDescriptor(): PropertyDescriptor {
  let target: object | null = window;
  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, 'localStorage');
    if (descriptor) return descriptor;
    target = Object.getPrototypeOf(target) as object | null;
  }
  throw new Error('localStorage descriptor not found on the jsdom window');
}

export function blockStorage(): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    },
  });
}

export function restoreStorage(descriptor: PropertyDescriptor): void {
  Object.defineProperty(window, 'localStorage', descriptor);
}

/** Reports the active route so a test can assert where the guards sent the visitor. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

/** Small probe rendered behind the guards, to observe when a protected page is mounted. */
export function ProtectedProbe({ label }: { label: string }) {
  return <p data-testid="protected">{label}</p>;
}

/** Renders the real application at `initialPath` with the supplied API stubs. */
export function renderAt(initialPath: string, routes: StubRoutes): RecordedRequest[] {
  const requests = stubApi(routes);
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <App />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>,
  );
  return requests;
}
