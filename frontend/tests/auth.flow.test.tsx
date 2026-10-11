import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, useEffect, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { apiGet, setStoredToken } from '@/api/client';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RequireAuth } from '@/components/layout/RouteGuards';
import type { AuthUser } from '@/api/types';

/**
 * End-to-end (component level) authentication regression tests.
 *
 * These mount the *real* `AuthProvider`, the real route guards and the real API client
 * against a stubbed `fetch`, because that is where the reported bug lived: the sign-in
 * succeeded, the user object was set, but the protected requests left without a token.
 */

const ADMIN: AuthUser = {
  id: 1,
  email: 'admin@ecocycle.test',
  fullName: 'Ananya Rao',
  role: 'ADMIN',
  status: 'ACTIVE',
  phone: null,
  city: 'Chennai',
  staffedCenterId: null,
  agentProfileId: null,
  recyclerProfileId: null,
  lastLoginAt: '2026-10-11T08:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as AuthUser;

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function storageDescriptor(): { descriptor: PropertyDescriptor } {
  let target: object | null = window;
  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, 'localStorage');
    if (descriptor) return { descriptor };
    target = Object.getPrototypeOf(target) as object | null;
  }
  throw new Error('localStorage descriptor not found');
}

const originalStorage = storageDescriptor();

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

/** Stubs `fetch` with a tiny router; records everything the app sends. */
function stubApi(
  routes: Record<string, (request: RecordedRequest) => { status: number; body?: unknown }>,
): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request: RecordedRequest = {
        url: String(input),
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
      };
      requests.push(request);
      const path = request.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      const handler = routes[path];
      if (!handler) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: path } }), { status: 404 });
      const { status, body } = handler(request);
      if (status === 204) return new Response(null, { status });
      return new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return requests;
}

const loginRoute = (token: string) => () => ({ status: 200, body: { data: { token, user: ADMIN } } });

/**
 * Mirrors the real app: the visitor signs in on `/login`, and the protected branch becomes
 * reachable afterwards. `AutoSignIn` plays the part of the sign-in form's submit handler.
 */
function Harness({
  children,
  initialPath = '/admin',
  autoSignIn = false,
}: {
  children: React.ReactNode;
  initialPath?: string;
  /** When true, `/login` performs the sign-in; otherwise it is just a landmark screen. */
  autoSignIn?: boolean;
}) {
  return (
    <StrictMode>
      <MemoryRouter
        initialEntries={[initialPath]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <Routes>
            <Route path="/login" element={autoSignIn ? <AutoSignIn /> : <div>login screen</div>} />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <>{children}</>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>
  );
}

/** Stands in for the login form: authenticates once, then opens the dashboard. */
function AutoSignIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    login('admin@ecocycle.test', 'Passw0rd123')
      .then(() => {
        if (active) navigate('/admin', { replace: true });
      })
      .catch((caught: unknown) => {
        if (active) setError((caught as Error).message);
      });
    return () => {
      active = false;
    };
  }, [login, navigate]);

  return <div>login screen{error ? `: ${error}` : ''}</div>;
}

/** Stands in for a protected dashboard page: loads one resource on mount. */
function DashboardProbe() {
  const { user } = useAuth();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<{ role: string }>('/api/dashboard')
      .then(() => active && setStatus('dashboard-loaded'))
      .catch((caught: unknown) => active && setError((caught as Error).message));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <p data-testid="role">{user?.role ?? 'anonymous'}</p>
      <p data-testid="status">{status}</p>
      <p data-testid="error">{error ?? ''}</p>
    </div>
  );
}

beforeEach(() => {
  restoreStorage();
  // Start every test with no session: the client keeps the token in memory for the life of a
  // page, so a test that wants to simulate a *reload* must clear memory and seed storage
  // itself (which is what the refresh test below does).
  window.localStorage.clear();
  setStoredToken(null);
  vi.unstubAllGlobals();
});

afterEach(() => {
  restoreStorage();
  vi.unstubAllGlobals();
});

describe('sign-in on a browser that blocks Web Storage (sandboxed preview)', () => {
  it('sends the session token on the protected requests made after login', async () => {
    blockStorage();
    const requests = stubApi({
      '/api/auth/login': loginRoute('tok-preview'),
      '/api/dashboard': () => ({ status: 200, body: { data: { role: 'ADMIN' } } }),
    });

    render(
      <Harness initialPath="/login" autoSignIn>
        <DashboardProbe />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('dashboard-loaded'));

    const dashboardRequest = requests.find((request) => request.url.endsWith('/api/dashboard'));
    expect(dashboardRequest?.headers.Authorization).toBe('Bearer tok-preview');
    expect(screen.getByTestId('error').textContent).toBe('');
    expect(screen.getByTestId('role').textContent).toBe('ADMIN');
  });

  it('never leaves a protected page showing "Missing bearer token"', async () => {
    blockStorage();
    // A stub that behaves like the real API: no header, no access.
    stubApi({
      '/api/auth/login': loginRoute('tok-preview'),
      '/api/dashboard': (request) =>
        request.headers.Authorization
          ? { status: 200, body: { data: { role: 'ADMIN' } } }
          : { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } } },
    });

    render(
      <Harness initialPath="/login" autoSignIn>
        <DashboardProbe />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('dashboard-loaded'));
    expect(screen.queryByText(/Missing bearer token/)).toBeNull();
  });
});

describe('sign-in on a normal browser', () => {
  it('persists the token and attaches it to protected requests', async () => {
    const requests = stubApi({
      '/api/auth/login': loginRoute('tok-persisted'),
      '/api/dashboard': () => ({ status: 200, body: { data: { role: 'ADMIN' } } }),
    });

    render(
      <Harness initialPath="/login" autoSignIn>
        <DashboardProbe />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('dashboard-loaded'));
    expect(window.localStorage.getItem('ecocycle.token')).toBe('tok-persisted');
    expect(requests.find((request) => request.url.endsWith('/api/dashboard'))?.headers.Authorization).toBe(
      'Bearer tok-persisted',
    );
  });
});

describe('a page refresh with a stored session', () => {
  it('restores the user from the persisted token and loads protected data with it', async () => {
    // What a reload looks like: the token is in storage and the module state starts empty.
    window.localStorage.setItem('ecocycle.token', 'tok-restored');
    const requests = stubApi({
      '/api/auth/me': () => ({ status: 200, body: { data: { user: ADMIN } } }),
      '/api/dashboard': () => ({ status: 200, body: { data: { role: 'ADMIN' } } }),
    });

    render(
      <Harness>
        <DashboardProbe />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('dashboard-loaded'));

    const meRequest = requests.find((request) => request.url.endsWith('/api/auth/me'));
    const dashboardRequest = requests.find((request) => request.url.endsWith('/api/dashboard'));
    expect(meRequest?.headers.Authorization).toBe('Bearer tok-restored');
    expect(dashboardRequest?.headers.Authorization).toBe('Bearer tok-restored');
    expect(screen.getByTestId('role').textContent).toBe('ADMIN');
    // The guard let the protected page render: no trip through the login screen.
    expect(screen.queryByText('login screen')).toBeNull();
  });
});

describe('an expired session', () => {
  it('returns the visitor to the login screen instead of rendering an error panel', async () => {
    window.localStorage.setItem('ecocycle.token', 'tok-expired');
    stubApi({
      '/api/auth/me': () => ({ status: 200, body: { data: { user: ADMIN } } }),
      '/api/dashboard': () => ({
        status: 401,
        body: { error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } },
      }),
    });

    render(
      <Harness>
        <DashboardProbe />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByText('login screen')).toBeTruthy());
    expect(window.localStorage.getItem('ecocycle.token')).toBeNull();
  });
});

describe('leaving a protected page', () => {
  it('redirects to /login once the session is cleared by an API rejection', async () => {
    window.localStorage.setItem('ecocycle.token', 'tok-ok');
    const requests = stubApi({
      '/api/auth/me': () => ({ status: 200, body: { data: { user: ADMIN } } }),
      '/api/dashboard': () => ({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Account no longer exists' } } }),
    });

    function SignOutButton() {
      const { logout } = useAuth();
      const navigate = useNavigate();
      return (
        <button
          type="button"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        >
          sign out
        </button>
      );
    }

    render(
      <Harness>
        <SignOutButton />
      </Harness>,
    );

    await waitFor(() => expect(requests.some((request) => request.url.endsWith('/api/auth/me'))).toBe(true));
    expect(screen.queryByText('login screen')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'sign out' }));
    await waitFor(() => expect(screen.getByText('login screen')).toBeTruthy());
    expect(window.localStorage.getItem('ecocycle.token')).toBeNull();
  });
});

describe('guard behaviour', () => {
  it('sends an anonymous visitor straight to /login without calling the API', async () => {
    blockStorage();
    const requests = stubApi({});

    render(
      <Harness>
        <Navigate to="/admin" />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByText('login screen')).toBeTruthy());
    expect(requests.filter((request) => !request.url.endsWith('/api/auth/me'))).toHaveLength(0);
  });
});
