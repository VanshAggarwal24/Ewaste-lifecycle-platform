/**
 * Rate limiting on the credential endpoints.
 *
 * This file opts back in to the limiter (which the rest of the suite disables so that
 * hundreds of rapid assertions do not trip it) via TEST_FORCE_RATE_LIMIT, and lowers the
 * attempt budget before the configuration module is first imported. Static imports are
 * hoisted above statements, so the values are set first and the app is pulled in with a
 * dynamic import inside `beforeAll`.
 */
process.env.TEST_FORCE_RATE_LIMIT = 'true';
process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = '4';
process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES = '15';

import request from 'supertest';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  const [{ createApp }, { resetDatabase, seedFixture }] = await Promise.all([
    import('../../src/app'),
    import('../helpers/testDb'),
  ]);

  await resetDatabase();
  await seedFixture();
  app = createApp();
});

describe('authentication rate limiting', () => {
  it('blocks repeated failed logins with 429 once the budget is exhausted', async () => {
    const attempt = () =>
      request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: 'WrongPassword123' });

    // The configured budget is 4 failed attempts: the first four are handled normally.
    for (let i = 0; i < 4; i += 1) {
      const response = await attempt();
      expect(response.status).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toMatch(/too many requests/i);
  });

  it('still reports the limitation through the standard headers', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: 'WrongPassword123' });

    expect(response.headers).toHaveProperty('ratelimit-policy');
    expect(response.headers).toHaveProperty('ratelimit');
  });
});
