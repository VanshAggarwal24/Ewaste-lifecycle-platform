import { anon, as, resetDatabase, seedFixture, TEST_PASSWORD, type Fixture } from '../helpers/testDb';
import { prisma } from '../../src/lib/prisma';
import jwt from 'jsonwebtoken';

/**
 * Authentication: registration, login, token handling, profile self-service.
 * The security-critical assertions are that public registration can never create a
 * privileged account, and that credentials never leak through any response.
 */
describe('authentication', () => {
  let fx: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fx = await seedFixture();
  });

  describe('registration', () => {
    it('creates a USER account and returns a usable token', async () => {
      const response = await anon(fx.app).post('/api/auth/register').send({
        email: 'newcomer@test.local',
        password: 'Newcomer123',
        fullName: 'New Comer',
        phone: '+91 90000 12345',
        city: 'Chennai',
      });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('USER');
      expect(response.body.data.user.email).toBe('newcomer@test.local');
      expect(response.body.data.token).toEqual(expect.any(String));

      // The password is stored only as a bcrypt hash.
      const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'newcomer@test.local' } });
      expect(stored.passwordHash).not.toContain('Newcomer123');
      expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('IGNORES an injected role and still creates a plain USER (privilege-escalation guard)', async () => {
      const response = await anon(fx.app).post('/api/auth/register').send({
        email: 'sneaky@test.local',
        password: 'Sneaky123',
        fullName: 'Sneaky Person',
        role: 'ADMIN', // must be stripped by the schema
        status: 'ACTIVE',
        agentProfile: { maxDailyPickups: 999 },
      });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('USER');

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'sneaky@test.local' } });
      expect(stored.role).toBe('USER');
      expect(await prisma.agentProfile.count({ where: { userId: stored.id } })).toBe(0);
    });

    it('never returns the password hash', async () => {
      const response = await anon(fx.app).post('/api/auth/register').send({
        email: 'nohash@test.local',
        password: 'NoHash123',
        fullName: 'No Hash',
      });

      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email with 409', async () => {
      const payload = { email: 'duplicate@test.local', password: 'Duplicate123', fullName: 'First' };
      expect((await anon(fx.app).post('/api/auth/register').send(payload)).status).toBe(201);

      const second = await anon(fx.app).post('/api/auth/register').send(payload);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('CONFLICT');
    });

    it('treats emails case-insensitively (no duplicate accounts)', async () => {
      await anon(fx.app)
        .post('/api/auth/register')
        .send({ email: 'MixedCase@Test.Local', password: 'MixedCase123', fullName: 'Mixed' });

      const duplicate = await anon(fx.app)
        .post('/api/auth/register')
        .send({ email: 'mixedcase@test.local', password: 'MixedCase123', fullName: 'Mixed Two' });

      expect(duplicate.status).toBe(409);
      expect(await prisma.user.count({ where: { email: 'mixedcase@test.local' } })).toBe(1);
    });

    it.each([
      ['missing f ields', { email: 'x@y.z' }, /validation/i],
      ['invalid email', { email: 'not-an-email', password: 'GoodPass123', fullName: 'A B' }, /validation/i],
      ['short password', { email: 'short@test.local', password: 'Ab1', fullName: 'A B' }, /validation/i],
      ['password without a digit', { email: 'nodigit@test.local', password: 'abcdefgh', fullName: 'A B' }, /validation/i],
      ['password without a letter', { email: 'noletter@test.local', password: '12345678', fullName: 'A B' }, /validation/i],
      ['one character name', { email: 'shortname@test.local', password: 'GoodPass123', fullName: 'A' }, /validation/i],
      ['bad phone', { email: 'badphone@test.local', password: 'GoodPass123', fullName: 'A B', phone: 'abc' }, /validation/i],
    ])('rejects registration with %s (422)', async (_label, payload, messagePattern) => {
      const response = await anon(fx.app).post('/api/auth/register').send(payload);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toMatch(messagePattern);
      expect(Array.isArray(response.body.error.details.issues)).toBe(true);
    });

    it('rejects a non-JSON body cleanly', async () => {
      const response = await anon(fx.app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"email": bad json}');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('login', () => {
    it('authenticates with correct credentials', async () => {
      const response = await anon(fx.app)
        .post('/api/auth/login')
        .send({ email: fx.citizen.email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.data.token).toEqual(expect.any(String));
      expect(response.body.data.user.id).toBe(fx.citizen.id);

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: fx.citizen.id } });
      expect(stored.lastLoginAt).toBeInstanceOf(Date);
    });

    it('rejects a wrong password', async () => {
      const response = await anon(fx.app)
        .post('/api/auth/login')
        .send({ email: fx.citizen.email, password: 'definitely-wrong' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('gives the same response for an unknown email (no account enumeration)', async () => {
      const unknown = await anon(fx.app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: 'Whatever123' });
      const wrongPassword = await anon(fx.app)
        .post('/api/auth/login')
        .send({ email: fx.citizen.email, password: 'Whatever123' });

      expect(unknown.status).toBe(401);
      expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
    });

    it('refuses a suspended account', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'suspended@test.local',
          passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: fx.citizen.id } })).passwordHash,
          fullName: 'Suspended User',
          role: 'USER',
          status: 'SUSPENDED',
        },
      });

      const response = await anon(fx.app)
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });

      expect(response.status).toBe(403);
      expect(response.body.error.message).toMatch(/suspended/i);
    });
  });

  describe('token handling', () => {
    it('returns the current user for a valid token', async () => {
      const response = await as(fx.app, fx.citizen).get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body.data.user.id).toBe(fx.citizen.id);
      expect(response.body.data.user.role).toBe('USER');
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);
    });

    it('rejects a missing token', async () => {
      const response = await anon(fx.app).get('/api/auth/me');
      expect(response.status).toBe(401);
    });

    it.each([
      ['garbage', 'not-a-token'],
      ['wrong signature', jwt.sign({ sub: '1', role: 'ADMIN', email: 'a@b.c' }, 'wrong-secret-value-here')],
      ['expired', jwt.sign({ sub: '1', role: 'ADMIN', email: 'a@b.c' }, process.env.JWT_SECRET as string, { expiresIn: '-5s' })],
    ])('rejects a %s token', async (_label, token) => {
      const response = await anon(fx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a valid token whose account was deleted', async () => {
      const created = await anon(fx.app)
        .post('/api/auth/register')
        .send({ email: 'shortlived@test.local', password: 'ShortLived123', fullName: 'Short Lived' });
      const token = created.body.data.token;
      const id = created.body.data.user.id;

      await prisma.user.delete({ where: { id } });

      const response = await anon(fx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(401);
      expect(response.body.error.message).toMatch(/no longer exists/i);
    });

    it('rejects a token belonging to a suspended user immediately', async () => {
      await prisma.user.update({ where: { id: fx.otherCitizen.id }, data: { status: 'SUSPENDED' } });

      const response = await as(fx.app, fx.otherCitizen).get('/api/auth/me');
      expect(response.status).toBe(403);
      expect(response.body.error.message).toMatch(/suspended/i);

      await prisma.user.update({ where: { id: fx.otherCitizen.id }, data: { status: 'ACTIVE' } });
    });
  });

  describe('profile self-service', () => {
    it('updates the caller own profile fields', async () => {
      const response = await as(fx.app, fx.citizen)
        .patch('/api/auth/me')
        .send({ fullName: 'Citizen Renamed', city: 'Madurai', pincode: '625001' });

      expect(response.status).toBe(200);
      expect(response.body.data.user.fullName).toBe('Citizen Renamed');
      expect(response.body.data.user.city).toBe('Madurai');
    });

    it('refuses an empty update and invalid coordinates', async () => {
      expect((await as(fx.app, fx.citizen).patch('/api/auth/me').send({})).status).toBe(422);
      expect(
        (await as(fx.app, fx.citizen).patch('/api/auth/me').send({ latitude: 200 })).status,
      ).toBe(422);
    });

    it('cannot be used to change your own role', async () => {
      const response = await as(fx.app, fx.citizen).patch('/api/auth/me').send({ role: 'ADMIN' } as never);

      // `role` is not part of the schema, so it is stripped and the request is empty.
      expect(response.status).toBe(422);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: fx.citizen.id } });
      expect(stored.role).toBe('USER');
    });

    it('changes the password only with the correct current password', async () => {
      const wrong = await as(fx.app, fx.citizen)
        .post('/api/auth/change-password')
        .send({ currentPassword: 'incorrect-one', newPassword: 'BrandNewPass123' });
      expect(wrong.status).toBe(401);

      const ok = await as(fx.app, fx.citizen)
        .post('/api/auth/change-password')
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'BrandNewPass123' });
      expect(ok.status).toBe(200);

      const oldLogin = await anon(fx.app).post('/api/auth/login').send({ email: fx.citizen.email, password: TEST_PASSWORD });
      expect(oldLogin.status).toBe(401);

      const newLogin = await anon(fx.app).post('/api/auth/login').send({ email: fx.citizen.email, password: 'BrandNewPass123' });
      expect(newLogin.status).toBe(200);

      // Restore for any later suite that logs in as the citizen.
      await anon(fx.app).post('/api/auth/login').send({ email: fx.citizen.email, password: 'BrandNewPass123' });
      const restore = await prisma.user.findUniqueOrThrow({ where: { id: fx.citizen.id } });
      expect(restore.passwordHash).not.toContain('BrandNewPass123');
    });

    it('refuses reusing the same password', async () => {
      const response = await as(fx.app, fx.citizen)
        .post('/api/auth/change-password')
        .send({ currentPassword: 'BrandNewPass123', newPassword: 'BrandNewPass123' });
      expect(response.status).toBe(409);
    });
  });

  describe('health endpoint', () => {
    it('reports database connectivity and never exposes secrets', async () => {
      const response = await anon(fx.app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('up');

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/password/i);
      expect(serialized).not.toMatch(/postgresql:\/\//);
      expect(serialized).not.toMatch(/secret/i);
    });
  });
});
