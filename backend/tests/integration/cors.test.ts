import request from 'supertest';
import { anon, resetDatabase, seedFixture, TEST_PASSWORD, type Fixture } from '../helpers/testDb';

/**
 * CORS behaviour for browser clients.
 *
 * The EcoCycle web app is served from the Vite dev server (or a preview host) and calls the
 * API with relative URLs. Two real-world cases must work, and one must never happen:
 *
 *   1. the request carries no `Origin` header (same-origin GETs, curl, server-to-server);
 *   2. the request comes from a sandboxed preview iframe, whose opaque origin is the literal
 *      string `null`, or from a develop/preview host;
 *   3. a request from an origin we do not allow must be answered **normally** — just without
 *      `Access-Control-Allow-Origin`, so the browser blocks the caller from reading it. It must
 *      never be turned into a `500`, which is a server failure, breaks same-origin browser
 *      traffic (the browser sends `Origin` on POSTs) and pollutes monitoring.
 */
describe('CORS', () => {
  let fx: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fx = await seedFixture();
  });

  const login = () =>
    anon(fx.app)
      .post('/api/auth/login')
      .send({ email: fx.citizen.email, password: TEST_PASSWORD });

  describe('requests without an Origin header', () => {
    it('are served normally', async () => {
      const response = await login();
      expect(response.status).toBe(200);
      expect(response.body.data.token).toEqual(expect.any(String));
    });
  });

  describe('a request from an opaque origin (sandboxed preview iframe)', () => {
    it('is answered, and the preflight allows it', async () => {
      const preflight = await request(fx.app)
        .options('/api/auth/login')
        .set('Origin', 'null')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,authorization');

      expect(preflight.status).toBeLessThan(400);
      expect(preflight.headers['access-control-allow-origin']).toBe('null');

      const response = await login().set('Origin', 'null');
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('null');
    });
  });

  describe('a request from a development or preview host', () => {
    it.each(['http://localhost:5173', 'http://127.0.0.1:5173', 'https://5173-abc123.e2b.app'])(
      'is allowed from %s',
      async (origin) => {
        const response = await login().set('Origin', origin);
        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe(origin);
      },
    );
  });

  describe('a request from a disallowed origin', () => {
    it('is answered without CORS headers instead of failing the server', async () => {
      const response = await login().set('Origin', 'https://evil.example.com');

      // Never a 5xx: the browser enforces the block by refusing to hand the body to the page.
      expect(response.status).toBeLessThan(500);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('still refuses to hand credentials to the caller', async () => {
      const response = await login().set('Origin', 'https://evil.example.com');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('answers a preflight without allowing the origin', async () => {
      const preflight = await request(fx.app)
        .options('/api/auth/login')
        .set('Origin', 'https://evil.example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(preflight.status).toBeLessThan(500);
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('an authenticated request', () => {
    it('still authorises by token, not by origin', async () => {
      const loginResponse = await anon(fx.app)
        .post('/api/auth/login')
        .send({ email: fx.admin.email, password: TEST_PASSWORD });
      const token = loginResponse.body.data.token as string;

      // A same-origin page posts an Origin header; the request must still succeed.
      const me = await request(fx.app)
        .get('/api/auth/me')
        .set('Origin', 'http://localhost:5173')
        .set('Authorization', `Bearer ${token}`);

      expect(me.status).toBe(200);
      expect(me.body.data.user.email).toBe(fx.admin.email);
    });
  });
});
