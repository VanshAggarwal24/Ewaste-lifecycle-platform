import { beforeAll, describe, expect, it } from 'vitest';
import { ApiError, apiGet, apiPost, setStoredToken } from '@/api/client';

/**
 * Live authentication smoke test.
 *
 * Drives the real API through the Vite dev-server proxy (`/api` → backend) using the real
 * API client, with Web Storage blocked to reproduce the environment in which the original
 * "Missing bearer token" bug appeared. Run it with the stack already up:
 *
 *     npm run test:live        # backend + `npm run dev` on :5173 must be running
 */

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

interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string; fullName: string };
}

beforeAll(async () => {
  // Fail fast with a readable message when nothing is listening.
  let reachable = false;
  try {
    const response = await fetch(`${BASE}/api/health`);
    reachable = response.ok;
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

describe('live authentication flow', () => {
  it('attaches the token from a real login when Web Storage is blocked', async () => {
    // The preview runs in a sandboxed iframe: every localStorage access throws.
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access is denied for this document.', 'SecurityError');
      },
    });

    const login = await apiPost<LoginResponse>('/api/auth/login', {
      email: 'admin@ecocycle.test',
      password: 'Passw0rd123',
    });
    expect(login.token).toEqual(expect.any(String));
    setStoredToken(login.token);

    // The exact request that used to fail with "Missing bearer token".
    const dashboard = await apiGet<{ role: string }>('/api/dashboard');
    expect(dashboard.role).toBe('ADMIN');

    const me = await apiGet<{ user: { email: string } }>('/api/auth/me');
    expect(me.user.email).toBe('admin@ecocycle.test');

    Object.defineProperty(window, 'localStorage', originalStorage);
  });

  it('still refuses a genuinely unauthenticated request with the documented envelope', async () => {
    setStoredToken(null);

    await expect(apiGet('/api/dashboard')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Missing bearer token',
    });
  });

  it('rejects wrong credentials without ending any session', async () => {
    await expect(
      apiPost('/api/auth/login', { email: 'admin@ecocycle.test', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      apiPost('/api/auth/login', { email: 'admin@ecocycle.test', password: 'wrong-password' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });
});
