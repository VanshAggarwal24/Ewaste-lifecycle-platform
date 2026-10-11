import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import adminDashboard from './fixtures/adminDashboard.json';
import { apiGet, getStoredToken, setStoredToken } from '@/api/client';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { renderAt, restoreStorage, storageDescriptor, stubApi } from './support/authHarness';

/**
 * Session lifecycle regressions.
 *
 * Reported symptoms: "Your session has ended. Please sign in again." appears on the login
 * screen, and a signed-in user occasionally lands on the 403 page. Two session rules are
 * pinned here:
 *
 *   1. A rejection that belongs to an *older* token must never end the session that replaced
 *      it (in-flight responses can land after the visitor has signed in again).
 *   2. A genuine 403 means "authenticated but not allowed" — it must not be mistaken for an
 *      expired session and must not invalidate a valid token.
 */

const ADMIN_USER = {
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
};

const originalStorage = storageDescriptor();

beforeEach(() => {
  restoreStorage(originalStorage);
  window.localStorage.clear();
  setStoredToken(null);
  vi.unstubAllGlobals();
});

afterEach(() => {
  restoreStorage(originalStorage);
  vi.unstubAllGlobals();
});

describe('a response that arrives after the session changed', () => {
  it('does not end the new session when an older request is rejected as unauthenticated', async () => {
    // The previous visit left a token behind; a request made with it is still in flight when
    // the visitor signs in again.
    window.localStorage.setItem('ecocycle.token', 'tok-previous');

    stubApi({
      '/api/auth/login': { status: 200, body: { data: { token: 'tok-current', user: ADMIN_USER } } },
      '/api/auth/me': { status: 200, body: { data: { user: ADMIN_USER } } },
      '/api/dashboard': {
        status: 401,
        delayMs: 150,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } },
      },
    });

    function Probe() {
      const { user, sessionNotice, login } = useAuth();
      useEffect(() => {
        // The stale request goes out first …
        void apiGet('/api/dashboard').catch(() => undefined);
        // … and the visitor signs in while it is still travelling.
        void login('admin@ecocycle.test', 'Passw0rd123').catch(() => undefined);
      }, [login]);
      return (
        <>
          <p data-testid="user">{user?.fullName ?? 'anonymous'}</p>
          <p data-testid="notice">{sessionNotice ?? ''}</p>
        </>
      );
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Ananya Rao'));

    // Let the stale 401 land.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(getStoredToken()).toBe('tok-current');
    expect(screen.getByTestId('user').textContent).toBe('Ananya Rao');
    expect(screen.getByTestId('notice').textContent).toBe('');
  });
});

describe('a genuine 403', () => {
  it('does not end a valid session when a page request is refused', async () => {
    // The account is authenticated — it simply may not use this resource. 403 means
    // "forbidden", never "expired": the token and the page must survive.
    window.localStorage.setItem('ecocycle.token', 'tok-valid');
    const requests = renderAt('/admin', {
      '/api/auth/me': { status: 200, body: { data: { user: ADMIN_USER } } },
      '/api/dashboard': {
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'This action requires one of the following roles: RECYCLER.' } },
      },
    });

    // The API's own explanation is surfaced on the page …
    await waitFor(() => expect(screen.getByText(/requires one of the following roles/i)).toBeTruthy());

    // … the visitor stays where they are, with a working session.
    expect(screen.getByTestId('location').textContent).toBe('/admin');
    expect(getStoredToken()).toBe('tok-valid');
    expect(requests.some((request) => request.path === '/api/auth/me')).toBe(true);
    expect(screen.queryByText('Your session has ended. Please sign in again.')).toBeNull();
  });

  it('does not pretend the session expired when the account itself is refused', async () => {
    // A suspended account: the token is valid, the server refuses the account. The visitor
    // returns to the sign-in screen, but the token is kept and the API's reason is shown —
    // not the misleading "your session has ended".
    window.localStorage.setItem('ecocycle.token', 'tok-suspended');
    renderAt('/admin', {
      '/api/auth/me': {
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'This account has been suspended.' } },
      },
    });

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
    expect(screen.getByText('This account has been suspended.')).toBeTruthy();
    expect(screen.queryByText('Your session has ended. Please sign in again.')).toBeNull();
    expect(getStoredToken()).toBe('tok-suspended');
  });
});

describe('restoring a session on page load', () => {
  it('renders nothing protected and makes no data request until the session is restored', async () => {
    window.localStorage.setItem('ecocycle.token', 'tok-restored');

    const requests = renderAt('/admin', {
      '/api/auth/me': { status: 200, delayMs: 150, body: { data: { user: ADMIN_USER } } },
      '/api/dashboard': { status: 200, body: { data: adminDashboard } },
    });

    // While the restore is in flight: a spinner, and no dashboard request yet.
    await waitFor(() => expect(screen.getByText(/restoring your session/i)).toBeTruthy());
    expect(requests.some((request) => request.path === '/api/dashboard')).toBe(false);

    // Once it resolves, the protected page loads with the restored token.
    await waitFor(() => expect(screen.getByText(/operations dashboard/i)).toBeTruthy());
    const dashboardRequest = requests.find((request) => request.path === '/api/dashboard');
    expect(dashboardRequest?.headers.Authorization).toBe('Bearer tok-restored');
  });
});

describe('an expired token', () => {
  it('ends the session only for the request that used the current token', async () => {
    setStoredToken('tok-live');

    stubApi({
      '/api/dashboard': {
        status: 401,
        body: { error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } },
      },
      '/api/auth/login': { status: 200, body: { data: { token: 'tok-new', user: ADMIN_USER } } },
    });

    function Probe() {
      const { user, sessionNotice } = useAuth();
      return (
        <>
          <p data-testid="user">{user?.fullName ?? 'anonymous'}</p>
          <p data-testid="notice">{sessionNotice ?? ''}</p>
        </>
      );
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await apiGet('/api/dashboard').catch(() => undefined);

    await waitFor(() =>
      expect(screen.getByTestId('notice').textContent).toBe('Your session has ended. Please sign in again.'),
    );
    expect(getStoredToken()).toBeNull();
    expect(screen.getByTestId('user').textContent).toBe('anonymous');
  });
});
