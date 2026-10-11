import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '@/App';
import { AppProviders } from '@/context/AppProviders';
import { getStoredToken, setStoredToken } from '@/api/client';

/**
 * Preview simulation: the real application, the real API.
 *
 * Every other frontend suite stubs `fetch`, and the other live suite drives the API client
 * without rendering React. Neither could have caught the two faults that broke the actual
 * preview, because both live in the seam between them:
 *
 *   - the sign-in POST was answered with `500 Origin … is not allowed by CORS` (the browser
 *     always sends `Origin` on a POST, and a sandboxed iframe sends the literal `null`), so
 *     logging in was impossible; and
 *   - a token left over from an earlier visit produced `401` on the first `/auth/me` of the
 *     page load, which the app announced as "your session has ended" on the sign-in screen.
 *
 * This suite mounts `App` itself — real router, real guards, real auth context, real login
 * form — against the running backend through the dev-server proxy, with Web Storage blocked to
 * reproduce the sandboxed preview iframe, and signs in as every seeded role.
 *
 *     npm run test:live
 */

const PASSWORD = 'Passw0rd123';

const ACCOUNTS: { email: string; role: string; fullName: string; home: string; heading: RegExp }[] = [
  { email: 'admin@ecocycle.test', role: 'ADMIN', fullName: 'Ananya Rao', home: '/admin', heading: /operations dashboard/i },
  { email: 'user.priya@ecocycle.test', role: 'USER', fullName: 'Priya Sharma', home: '/dashboard', heading: /your e-waste/i },
  { email: 'agent.chennai@ecocycle.test', role: 'COLLECTION_AGENT', fullName: 'Karthik Subramanian', home: '/agent', heading: /collection queue|dashboard/i },
  { email: 'staff.chennai@ecocycle.test', role: 'CENTER_STAFF', fullName: 'Divya Menon', home: '/center', heading: /centre|dashboard/i },
  { email: 'recycler.greenmetals@ecocycle.test', role: 'RECYCLER', fullName: 'Suresh Iyer', home: '/recycler', heading: /dashboard|batch/i },
];

const BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5173';

function storageDescriptor(): PropertyDescriptor {
  let target: object | null = window;
  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, 'localStorage');
    if (descriptor) return descriptor;
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

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderApp() {
  render(
    <StrictMode>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {/* The real provider stack from main.tsx: toasts + auth, then the router's app. */}
        <AppProviders>
          <App />
          <LocationProbe />
        </AppProviders>
      </MemoryRouter>
    </StrictMode>,
  );
}

async function signIn(email: string) {
  await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

beforeAll(async () => {
  let reachable = false;
  try {
    reachable = (await fetch(`${BASE}/api/health`)).ok;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    throw new Error(
      `No EcoCycle API at ${BASE}. Start the backend and the frontend dev server, or point ` +
        `ECOCYCLE_API_URL at a running stack.`,
    );
  }
});

beforeEach(() => {
  // Each test starts with no session: the client keeps its token in memory for the life of a
  // page, so a previous test's sign-in must not leak into the next one.
  setStoredToken(null);
  blockStorage();
});

afterEach(() => {
  cleanup();
  setStoredToken(null);
  Object.defineProperty(window, 'localStorage', originalStorage);
});

describe('the preview: real app, real API, Web Storage blocked', () => {
  it.each(ACCOUNTS)('$role signs in through the form and reaches $home', async (account) => {
    renderApp();
    await signIn(account.email);

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(account.home), {
      timeout: 15_000,
    });

    // The role's own name and screen are rendered, and no session warning is shown.
    await waitFor(() => expect(screen.getAllByText(account.fullName).length).toBeGreaterThan(0));
    expect(screen.queryByText(/session has ended/i)).toBeNull();
    expect(screen.queryByText(/do not have access to this page/i)).toBeNull();

    // The token is held in memory even though Web Storage is unavailable.
    expect(getStoredToken()).toEqual(expect.any(String));
  });

  it('never greets a visitor with a session warning before they sign in', async () => {
    renderApp();

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy());
    expect(screen.queryByText(/session has ended/i)).toBeNull();
  });
});
