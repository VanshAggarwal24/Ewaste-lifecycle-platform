import { as, anon, itemPayload, pickupPayload, resetDatabase, seedFixture, type Fixture } from '../helpers/testDb';
import { prisma } from '../../src/lib/prisma';

/**
 * Authorisation: role gates and record-level ownership.
 *
 * The platform must never let one user read or mutate another user's records, and
 * organisation roles must only act within their own custody. Where a record exists but is
 * not visible to the caller the API answers 404 (not 403), so an attacker cannot use the
 * API to confirm that a record exists.
 */
describe('authorization', () => {
  let fx: Fixture;
  let citizenItemId: number;
  let citizenPickupId: number;

  beforeAll(async () => {
    await resetDatabase();
    fx = await seedFixture();

    // A complete pickup owned by the first citizen, assigned to and collected by agentNear.
    const submission = await as(fx.app, fx.citizen)
      .post('/api/items')
      .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });

    citizenPickupId = submission.body.data.pickupRequest.id;
    citizenItemId = submission.body.data.items[0].id;

    await as(fx.app, fx.admin).post(`/api/pickups/${citizenPickupId}/assign`).send({ method: 'AUTO' });
    await as(fx.app, fx.agentNear).post(`/api/pickups/${citizenPickupId}/accept`);
    await as(fx.app, fx.agentNear).post(`/api/pickups/${citizenPickupId}/collect`).send({});
    await as(fx.app, fx.staff).post(`/api/pickups/${citizenPickupId}/receive`).send({});
  });

  describe('unauthenticated access', () => {
    it.each([
      '/api/items',
      '/api/pickups',
      '/api/batches',
      '/api/recoveries',
      '/api/dashboard',
      '/api/analytics/overview',
      '/api/users',
      '/api/centers',
      '/api/categories',
      '/api/inspections',
      '/api/activity',
    ])('blocks %s without a token', async (url) => {
      const response = await anon(fx.app).get(url);
      expect(response.status).toBe(401);
    });
  });

  describe('record-level ownership', () => {
    it('hides another user item behind a 404', async () => {
      const response = await as(fx.app, fx.otherCitizen).get(`/api/items/${citizenItemId}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('never lists another user items', async () => {
      const response = await as(fx.app, fx.otherCitizen).get('/api/items');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('prevents a user from reading another user pickup request', async () => {
      const response = await as(fx.app, fx.otherCitizen).get(`/api/pickups/${citizenPickupId}`);
      expect(response.status).toBe(404);
    });

    it('prevents a user from cancelling another user pickup', async () => {
      const response = await as(fx.app, fx.otherCitizen)
        .post(`/api/pickups/${citizenPickupId}/cancel`)
        .send({});

      expect(response.status).toBe(403);
      const request = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: citizenPickupId } });
      expect(request.status).toBe('RECEIVED_AT_CENTER'); // unchanged
    });

    it('prevents a user from editing another user item', async () => {
      const response = await as(fx.app, fx.otherCitizen)
        .patch(`/api/items/${citizenItemId}`)
        .send({ name: 'Hijacked' });

      expect(response.status).toBe(403);
      const item = await prisma.ewasteItem.findUniqueOrThrow({ where: { id: citizenItemId } });
      expect(item.name).not.toBe('Hijacked');
    });

    it('lets an administrator read any record (support access)', async () => {
      const response = await as(fx.app, fx.admin).get(`/api/items/${citizenItemId}`);
      expect(response.status).toBe(200);
      expect(response.body.data.item.id).toBe(citizenItemId);
    });
  });

  describe('role gates', () => {
    it.each([
      ['a citizen cannot inspect items', 'citizen', () => `/api/items/${citizenItemId}/inspect`],
      ['a citizen cannot list inspections', 'citizen', () => '/api/inspections'],
      ['an agent cannot create a processing batch', 'agentNear', () => '/api/batches'],
      ['a recycler cannot create a processing batch', 'recycler', () => '/api/batches'],
      ['a citizen cannot assign pickups', 'citizen', () => `/api/pickups/${citizenPickupId}/assign`],
      ['an agent cannot confirm receipt at a centre', 'agentNear', () => `/api/pickups/${citizenPickupId}/receive`],
      ['a citizen cannot record material recovery', 'citizen', () => '/api/recoveries'],
    ])('%s', async (_label, actorKey, urlFactory) => {
      const actor = fx[actorKey as keyof Fixture] as { token: string };
      const response = await as(fx.app, actor)
        .post(urlFactory() as string)
        .send({});

      expect([403, 404]).toContain(response.status);
    });

    it('blocks non-administrators from the user administration endpoints', async () => {
      for (const actor of [fx.citizen, fx.agentNear, fx.staff, fx.recycler]) {
        expect((await as(fx.app, actor).get('/api/users')).status).toBe(403);
        expect(
          (
            await as(fx.app, actor).post('/api/users').send({
              email: 'escalate@test.local',
              password: 'Escalate123',
              fullName: 'Escalate Me',
              role: 'ADMIN',
            })
          ).status,
        ).toBe(403);
      }
    });

    it('blocks non-administrators from creating centres and categories', async () => {
      for (const actor of [fx.citizen, fx.agentNear, fx.staff, fx.recycler]) {
        expect(
          (
            await as(fx.app, actor).post('/api/centers').send({
              name: 'Rogue Centre',
              code: 'ROGUE-1',
              addressLine: '1 Rogue Road',
              city: 'Chennai',
              state: 'Tamil Nadu',
              pincode: '600001',
            })
          ).status,
        ).toBe(403);

        expect((await as(fx.app, actor).post('/api/categories').send({ name: 'Rogue' })).status).toBe(403);
      }
    });

    it('blocks centre staff of another centre from acting on this centre records', async () => {
      const inspect = await as(fx.app, fx.staffOtherCenter)
        .post(`/api/items/${citizenItemId}/inspect`)
        .send({ condition: 'FAULTY', qualityScore: 50, actualWeightKg: 1 });
      expect(inspect.status).toBe(403);

      const receive = await as(fx.app, fx.staffOtherCenter)
        .post(`/api/pickups/${citizenPickupId}/receive`)
        .send({});
      expect([403, 409]).toContain(receive.status);
    });

    it('blocks an unassigned agent from acting on someone else pickup', async () => {
      const response = await as(fx.app, fx.agentBusy).post(`/api/pickups/${citizenPickupId}/accept`);
      expect(response.status).toBe(403);
      expect(response.body.error.message).toMatch(/assigned to you/);
    });

    it('gives agents read-only visibility of the unassigned pool', async () => {
      const submission = await as(fx.app, fx.otherCitizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const openPickupId = submission.body.data.pickupRequest.id;

      const response = await as(fx.app, fx.agentBusy).get('/api/pickups?status=REQUESTED');
      expect(response.status).toBe(200);
      expect(response.body.data.map((p: { id: number }) => p.id)).toContain(openPickupId);

      // ... but cannot accept a request that has not been assigned to them.
      const accept = await as(fx.app, fx.agentBusy).post(`/api/pickups/${openPickupId}/accept`);
      expect(accept.status).toBe(403);
    });
  });

  describe('data scoping by role', () => {
    it('scopes the centre dashboard to the staff member own centre', async () => {
      const mine = await as(fx.app, fx.staff).get('/api/dashboard');
      expect(mine.status).toBe(200);
      expect(mine.body.data.center.id).toBe(fx.center.id);

      const theirs = await as(fx.app, fx.staffOtherCenter).get('/api/dashboard');
      expect(theirs.status).toBe(200);
      expect(theirs.body.data.center.id).toBe(fx.otherCenter.id);
      expect(theirs.body.data.totalItemsAtCenter).toBe(0);
    });

    it('scopes analytics to what each role may see', async () => {
      const citizen = await as(fx.app, fx.otherCitizen).get('/api/analytics/summary');
      expect(citizen.status).toBe(200);
      expect(citizen.body.data.users).toEqual([]); // only admins receive platform-wide user counts

      const admin = await as(fx.app, fx.admin).get('/api/analytics/summary');
      expect(admin.body.data.users.length).toBeGreaterThan(0);
    });

    it('restricts platform reports to the roles that need them', async () => {
      expect((await as(fx.app, fx.admin).get('/api/analytics/agents')).status).toBe(200);
      expect((await as(fx.app, fx.staff).get('/api/analytics/agents')).status).toBe(403);
      expect((await as(fx.app, fx.citizen).get('/api/analytics/assignments')).status).toBe(403);
      expect((await as(fx.app, fx.recycler).get('/api/analytics/centers')).status).toBe(403);
    });
  });

  describe('input hardening', () => {
    it('rejects a search term that is absurdly long', async () => {
      const response = await as(fx.app, fx.admin).get(`/api/items?search=${'a'.repeat(300)}`);
      expect(response.status).toBe(422);
    });

    it('rejects an unknown enum value in a filter', async () => {
      const response = await as(fx.app, fx.admin).get('/api/items?status=NOT_A_STATUS');
      expect(response.status).toBe(422);
    });

    it('caps the page size to prevent unbounded reads', async () => {
      const response = await as(fx.app, fx.admin).get('/api/items?limit=100000');
      expect(response.status).toBe(422); // exceeds the documented maximum of 100
    });

    it('rejects a negative identifier', async () => {
      expect((await as(fx.app, fx.admin).get('/api/items/-5')).status).toBe(422);
    });

    it('returns a structured 404 for an unknown route', async () => {
      const response = await anon(fx.app).get('/api/does-not-exist');
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
