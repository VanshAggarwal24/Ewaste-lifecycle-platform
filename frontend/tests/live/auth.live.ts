import { beforeAll, describe, expect, it } from 'vitest';
import { ApiError, apiGet, apiPost, getStoredToken, setStoredToken } from '@/api/client';

/**
 * Live authentication and authorization smoke test.
 *
 * Drives the real API through the Vite dev-server proxy (`/api` → backend) using the real API
 * client. Run it with the stack up:
 *
 *     npm run test:live        # backend on :4000 + `npm run dev` on :5173
 *
 * It covers the checks a browser performs on every visit: signing in as each seeded role,
 * carrying the bearer token to the role's own dashboard, restoring a session on reload, and
 * telling a genuine 403 apart from a lost session.
 */

const BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5173';
const PASSWORD = 'Passw0rd123';

interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string; fullName: string };
}

const ACCOUNTS: { email: string; role: string; fullName: string }[] = [
  { email: 'admin@ecocycle.test', role: 'ADMIN', fullName: 'Ananya Rao' },
  { email: 'user.priya@ecocycle.test', role: 'USER', fullName: 'Priya Sharma' },
  { email: 'agent.chennai@ecocycle.test', role: 'COLLECTION_AGENT', fullName: 'Karthik Subramanian' },
  { email: 'staff.chennai@ecocycle.test', role: 'CENTER_STAFF', fullName: 'Divya Menon' },
  { email: 'recycler.greenmetals@ecocycle.test', role: 'RECYCLER', fullName: 'Suresh Iyer' },
];

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

beforeAll(async () => {
  let reachable = false;
  try {
    reachable = (await fetch(`${BASE}/api/health`)).ok;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    throw new Error(
      `No EcoCycle API at ${BASE}. Start the backend (npm run dev in backend/) and the frontend ` +
        `dev server (npm run dev in frontend/), or point ECOCYCLE_API_URL at a running stack.`,
    );
  }
});

describe('the reverse proxy forwards the Authorization header', () => {
  it('reaches the API with and without a bearer token', async () => {
    const login = await apiPost<LoginResponse>('/api/auth/login', { email: ACCOUNTS[0].email, password: PASSWORD });

    // Raw fetch, bypassing the client, so the check is about the proxy rather than the app.
    const withHeader = await fetch(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    expect(withHeader.status).toBe(200);

    const withoutHeader = await fetch(`${BASE}/api/auth/me`);
    expect(withoutHeader.status).toBe(401);
    const body = (await withoutHeader.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(body.error.message).toBe('Missing bearer token');
  });
});

describe('all five seeded demo accounts', () => {
  it.each(ACCOUNTS)('$email signs in and reaches its own dashboard as $role', async (account) => {
    const login = await apiPost<LoginResponse>('/api/auth/login', {
      email: account.email,
      password: PASSWORD,
    });

    expect(login.token).toEqual(expect.any(String));
    expect(login.user.role).toBe(account.role);
    expect(login.user.fullName).toBe(account.fullName);

    setStoredToken(login.token);

    // The landing screen for that role, fetched exactly as the browser fetches it.
    const dashboard = await apiGet<{ role: string }>('/api/dashboard');
    expect(dashboard.role).toBe(account.role);

    // Identity is confirmed by the server, not by the client's cache.
    const me = await apiGet<{ user: { email: string; role: string } }>('/api/auth/me');
    expect(me.user.email).toBe(account.email);
    expect(me.user.role).toBe(account.role);
  });

  it('restores a session from a persisted token (what a page reload does)', async () => {
    const login = await apiPost<LoginResponse>('/api/auth/login', {
      email: ACCOUNTS[0].email,
      password: PASSWORD,
    });
    const persisted = login.token;

    // Simulate a fresh page: no in-memory state, the token comes from storage.
    setStoredToken(null);
    setStoredToken(persisted);

    const me = await apiGet<{ user: { role: string } }>('/api/auth/me');
    expect(me.user.role).toBe('ADMIN');
  });
});

describe('sessions on a browser that blocks Web Storage', () => {
  it('attaches the token from a real login when localStorage throws (sandboxed preview)', async () => {
    blockStorage();

    const login = await apiPost<LoginResponse>('/api/auth/login', {
      email: ACCOUNTS[0].email,
      password: PASSWORD,
    });
    setStoredToken(login.token);

    const dashboard = await apiGet<{ role: string }>('/api/dashboard');
    expect(dashboard.role).toBe('ADMIN');
    expect(getStoredToken()).toBe(login.token);

    Object.defineProperty(window, 'localStorage', originalStorage);
  });
});

describe('failures are told apart', () => {
  it('refuses an unauthenticated request with UNAUTHENTICATED', async () => {
    setStoredToken(null);
    await expect(apiGet('/api/dashboard')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Missing bearer token',
    });
  });

  it('rejects wrong credentials with INVALID_CREDENTIALS, not as a lost session', async () => {
    await expect(
      apiPost('/api/auth/login', { email: ACCOUNTS[0].email, password: 'wrong-password' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('returns a genuine 403 for a role that may not use an endpoint, keeping the session usable', async () => {
    const login = await apiPost<LoginResponse>('/api/auth/login', {
      email: 'user.priya@ecocycle.test',
      password: PASSWORD,
    });
    setStoredToken(login.token);

    // A citizen calling an administrator-only endpoint.
    const forbidden = await apiGet('/api/users').catch((caught: unknown) => caught);
    expect(forbidden).toBeInstanceOf(ApiError);
    expect(forbidden).toMatchObject({ status: 403, code: 'FORBIDDEN' });

    // 403 is "forbidden", never "expired": the session still works afterwards.
    expect(getStoredToken()).toBe(login.token);
    const me = await apiGet<{ user: { role: string } }>('/api/auth/me');
    expect(me.user.role).toBe('USER');
  });
});
