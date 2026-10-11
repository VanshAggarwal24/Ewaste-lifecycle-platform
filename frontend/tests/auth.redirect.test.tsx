import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import adminDashboard from './fixtures/adminDashboard.json';
import { renderAt, restoreStorage, storageDescriptor, tokenSentTo } from './support/authHarness';

/**
 * Where the user lands after signing in.
 *
 * Reported symptom: the signed-in administrator's name appears in the shell, yet the page
 * shows 403 "You do not have access to this page". The cause was the post-login redirect:
 * `RequireAuth` remembers the protected path an anonymous visitor tried to open, and the
 * login page sent *whoever signed in next* to that path. Signing in as ADMIN after a session
 * that ended on, say, `/center/incoming` therefore landed on a staff-only route, and the role
 * guard bounced it to `/forbidden` — while the sidebar happily showed the admin's name.
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

const STAFF_USER = {
  ...ADMIN_USER,
  id: 5,
  email: 'staff.chennai@ecocycle.test',
  fullName: 'Divya Menon',
  role: 'CENTER_STAFF',
  staffedCenterId: 1,
};

const EMPTY_PAGE = {
  data: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
};

const originalStorage = storageDescriptor();

function signIn(_requests: unknown, email: string, password = 'Passw0rd123') {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

beforeEach(() => {
  restoreStorage(originalStorage);
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  restoreStorage(originalStorage);
  vi.unstubAllGlobals();
});

describe('post-login destination', () => {
  it('sends an administrator to the admin dashboard, not to the staff route they never had access to', async () => {
    // An anonymous visit to a staff-only page: the guard records it and shows the login form.
    const requests = renderAt('/center/incoming', {
      '/api/auth/login': { status: 200, body: { data: { token: 'tok-admin', user: ADMIN_USER } } },
      '/api/dashboard': { status: 200, body: { data: adminDashboard } },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy());
    signIn(requests, 'admin@ecocycle.test');

    // The admin must end up on their own dashboard.
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin'));
    expect(screen.queryByText('You do not have access to this page')).toBeNull();
    // … and the dashboard request carries the new session's token.
    await waitFor(() => expect(tokenSentTo(requests, '/api/dashboard', 'tok-admin')).toBe(true));
  });

  it('still returns the user to the page they originally asked for when their role may open it', async () => {
    const requests = renderAt('/center/incoming', {
      '/api/auth/login': { status: 200, body: { data: { token: 'tok-staff', user: STAFF_USER } } },
      '/api/pickups': { status: 200, body: EMPTY_PAGE },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy());
    signIn(requests, 'staff.chennai@ecocycle.test');

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/center/incoming'));
    expect(screen.queryByText('You do not have access to this page')).toBeNull();
  });

  it('never redirects back to the login or register screens', async () => {
    renderAt('/login', {
      '/api/auth/login': { status: 200, body: { data: { token: 'tok-admin', user: ADMIN_USER } } },
      '/api/dashboard': { status: 200, body: { data: adminDashboard } },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy());
    signIn(undefined as never, 'admin@ecocycle.test');

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin'));
  });
});
