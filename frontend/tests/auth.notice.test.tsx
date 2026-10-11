import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import adminDashboard from './fixtures/adminDashboard.json';
import { getStoredToken } from '@/api/client';
import { renderAt, restoreStorage, storageDescriptor } from './support/authHarness';

/**
 * The "session has ended" notice.
 *
 * Reported symptom: the sign-in page showed *Your session has ended. Please sign in again.*
 * for every demo account, on arrival, before the visitor had done anything.
 *
 * The cause was that every rejected token was treated as news. A browser that still holds a
 * token from an earlier visit gets a 401 on the very first `/auth/me` of the page load, and the
 * app announced it as an ended session — while the visitor had not yet had one.
 *
 * The distinction these tests pin down:
 *   - a token that is already unusable when the app starts → discard it quietly;
 *   - a 401 for a session that was established during this page load → explain it.
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
  vi.unstubAllGlobals();
});

afterEach(() => {
  restoreStorage(originalStorage);
  vi.unstubAllGlobals();
});

describe('arriving with a token that no longer works', () => {
  it('shows a plain sign-in page instead of an expired-session warning', async () => {
    window.localStorage.setItem('ecocycle.token', 'token-left-over-from-an-earlier-visit');
    renderAt('/login', {
      '/api/auth/me': {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } },
      },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy());
    expect(screen.queryByText(/session has ended/i)).toBeNull();
    // …and the unusable token is discarded rather than reused on the next attempt.
    expect(getStoredToken()).toBeNull();
    expect(window.localStorage.getItem('ecocycle.token')).toBeNull();
  });

  it('does not warn when the API cannot be reached at all', async () => {
    window.localStorage.setItem('ecocycle.token', 'token-from-another-machine');
    renderAt('/login', {
      '/api/auth/me': { status: 503, body: { error: { code: 'INTERNAL_ERROR', message: 'Service unavailable' } } },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy());
    expect(screen.queryByText(/session has ended/i)).toBeNull();
    // A restarting API must not throw the visitor's token away.
    expect(getStoredToken()).toBe('token-from-another-machine');
  });

  it('signs in normally afterwards and reaches the role dashboard', async () => {
    window.localStorage.setItem('ecocycle.token', 'stale-token');
    const requests = renderAt('/login', {
      '/api/auth/me': {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } },
      },
      '/api/auth/login': { status: 200, body: { data: { token: 'fresh-token', user: ADMIN_USER } } },
      '/api/dashboard': { status: 200, body: { data: adminDashboard } },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'admin@ecocycle.test' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Passw0rd123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin'));
    expect(screen.queryByText(/session has ended/i)).toBeNull();
    const dashboardRequest = requests.find((request) => request.path === '/api/dashboard');
    expect(dashboardRequest?.headers.Authorization).toBe('Bearer fresh-token');
  });
});

describe('a session that ends while the app is in use', () => {
  it('is explained on the sign-in screen', async () => {
    window.localStorage.setItem('ecocycle.token', 'session-token');
    renderAt('/admin', {
      '/api/auth/me': { status: 200, body: { data: { user: ADMIN_USER } } },
      '/api/dashboard': {
        status: 401,
        body: { error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } },
      },
    });

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
    expect(screen.getByText('Your session has ended. Please sign in again.')).toBeTruthy();
  });
});

describe('a stale notice on the sign-in form', () => {
  it('is cleared when a new attempt starts, even if that attempt fails', async () => {
    window.localStorage.setItem('ecocycle.token', 'session-token');
    renderAt('/admin', {
      '/api/auth/me': { status: 200, body: { data: { user: ADMIN_USER } } },
      '/api/dashboard': { status: 401, body: { error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } } },
      '/api/auth/login': {
        status: 401,
        body: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
      },
    });

    await waitFor(() => expect(screen.getByText(/session has ended/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'admin@ecocycle.test' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText(/invalid email or password/i)).toBeTruthy());
    expect(screen.queryByText(/session has ended/i)).toBeNull();
  });
});
