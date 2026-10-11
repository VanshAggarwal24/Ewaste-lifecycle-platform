import { anon, as, itemPayload, pickupPayload, resetDatabase, seedFixture, TEST_PASSWORD, type Fixture } from '../helpers/testDb';
import { prisma } from '../../src/lib/prisma';

/**
 * Administrative operations: privileged account creation, reference data management,
 * lifecycle-safe deletion rules, and analytics that must agree with the underlying rows.
 */
describe('administration', () => {
  let fx: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fx = await seedFixture();
  });

  describe('privileged account creation', () => {
    it('creates a COLLECTION_AGENT with an agent profile in one transaction', async () => {
      const response = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'new.agent@test.local',
        password: 'NewAgent123',
        fullName: 'New Agent',
        role: 'COLLECTION_AGENT',
        agentProfile: {
          centerId: fx.center.id,
          vehicleType: 'Cargo Van',
          vehicleCapacityKg: 400,
          maxDailyPickups: 12,
          isAvailable: true,
          isVerified: true,
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('COLLECTION_AGENT');

      const created = await prisma.user.findUniqueOrThrow({
        where: { email: 'new.agent@test.local' },
        include: { agentProfile: true },
      });
      expect(created.agentProfile).not.toBeNull();
      expect(Number(created.agentProfile!.vehicleCapacityKg)).toBe(400);
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);

      // The new agent is immediately visible to the assignment engine.
      const agents = await as(fx.app, fx.admin).get('/api/users/agents');
      expect(agents.body.data.map((a: { email: string }) => a.email)).toContain('new.agent@test.local');
    });

    it('creates a CENTER_STAFF account bound to a centre', async () => {
      const response = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'new.staff@test.local',
        password: 'NewStaff123',
        fullName: 'New Staff',
        role: 'CENTER_STAFF',
        staffedCenterId: fx.center.id,
      });

      expect(response.status).toBe(201);
      const created = await prisma.user.findUniqueOrThrow({ where: { email: 'new.staff@test.local' } });
      expect(created.staffedCenterId).toBe(fx.center.id);
    });

    it('creates a RECYCLER with an organisation profile', async () => {
      const response = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'new.recycler@test.local',
        password: 'NewRecycler123',
        fullName: 'New Recycler',
        role: 'RECYCLER',
        recyclerProfile: {
          organizationName: 'New Recovery Industries',
          licenseNumber: 'TN-NEW-9999',
          acceptedMaterials: ['COPPER', 'STEEL'],
          maxCapacityKg: 15000,
        },
      });

      expect(response.status).toBe(201);
      const created = await prisma.user.findUniqueOrThrow({
        where: { email: 'new.recycler@test.local' },
        include: { recyclerProfile: true },
      });
      expect(created.recyclerProfile?.organizationName).toBe('New Recovery Industries');
      expect(created.recyclerProfile?.acceptedMaterials).toEqual(['COPPER', 'STEEL']);
    });

    it('requires the matching profile block for profile-backed roles (422)', async () => {
      const agentWithoutProfile = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'bad.agent@test.local',
        password: 'BadAgent123',
        fullName: 'Bad Agent',
        role: 'COLLECTION_AGENT',
      });
      expect(agentWithoutProfile.status).toBe(422);
      expect(JSON.stringify(agentWithoutProfile.body.error.details)).toMatch(/agentProfile is required/);

      const staffWithoutCenter = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'bad.staff@test.local',
        password: 'BadStaff123',
        fullName: 'Bad Staff',
        role: 'CENTER_STAFF',
      });
      expect(staffWithoutCenter.status).toBe(422);

      const profileOnWrongRole = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'mismatch@test.local',
        password: 'Mismatch123',
        fullName: 'Mismatch',
        role: 'USER',
        agentProfile: { vehicleCapacityKg: 100 },
      });
      expect(profileOnWrongRole.status).toBe(422);
    });

    it('rejects a duplicate email', async () => {
      const response = await as(fx.app, fx.admin).post('/api/users').send({
        email: fx.citizen.email,
        password: 'Duplicate123',
        fullName: 'Duplicate',
        role: 'USER',
      });
      expect(response.status).toBe(409);
    });

    it('rejects a recycler licence number that is already registered', async () => {
      const existing = await prisma.recyclerProfile.findFirstOrThrow();
      const response = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'cloned.recycler@test.local',
        password: 'Cloned123',
        fullName: 'Cloned Recycler',
        role: 'RECYCLER',
        recyclerProfile: {
          organizationName: 'Clone Recovery',
          licenseNumber: existing.licenseNumber,
          acceptedMaterials: ['STEEL'],
        },
      });

      expect(response.status).toBe(409);
      expect(await prisma.user.count({ where: { email: 'cloned.recycler@test.local' } })).toBe(0);
    });
  });

  describe('user administration', () => {
    it('lists and filters users', async () => {
      const all = await as(fx.app, fx.admin).get('/api/users?limit=100');
      expect(all.status).toBe(200);
      expect(all.body.meta.total).toBeGreaterThan(5);

      const agents = await as(fx.app, fx.admin).get('/api/users?role=COLLECTION_AGENT&limit=100');
      expect(agents.body.data.every((u: { role: string }) => u.role === 'COLLECTION_AGENT')).toBe(true);

      const searched = await as(fx.app, fx.admin).get('/api/users?search=Recycler');
      expect(searched.body.data.length).toBeGreaterThan(0);
    });

    it('suspends and reactivates an account', async () => {
      const created = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'suspend.me@test.local',
        password: 'SuspendMe123',
        fullName: 'Suspend Me',
        role: 'USER',
      });
      const id = created.body.data.user.id;

      const suspended = await as(fx.app, fx.admin).post(`/api/users/${id}/suspend`);
      expect(suspended.status).toBe(200);
      expect(suspended.body.data.user.status).toBe('SUSPENDED');

      const activated = await as(fx.app, fx.admin).post(`/api/users/${id}/activate`);
      expect(activated.body.data.user.status).toBe('ACTIVE');
    });

    it('prevents an administrator from suspending or demoting themselves', async () => {
      expect((await as(fx.app, fx.admin).post(`/api/users/${fx.admin.id}/suspend`)).status).toBe(403);
      expect(
        (await as(fx.app, fx.admin).patch(`/api/users/${fx.admin.id}`).send({ role: 'USER' })).status,
      ).toBe(403);

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: fx.admin.id } });
      expect(stored.role).toBe('ADMIN');
      expect(stored.status).toBe('ACTIVE');
    });

    it('refuses to demote a user who still holds a privileged profile', async () => {
      const response = await as(fx.app, fx.admin)
        .patch(`/api/users/${fx.agentNear.id}`)
        .send({ role: 'USER' });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/agent profile/i);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: fx.agentNear.id } })).role).toBe('COLLECTION_AGENT');
    });

    it('refuses to delete a user who owns lifecycle records', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      expect(submission.status).toBe(201);

      const response = await as(fx.app, fx.admin).delete(`/api/users/${fx.citizen.id}`);
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/audit trail/);
      expect(await prisma.user.count({ where: { id: fx.citizen.id } })).toBe(1);
    });

    it('deletes a user with no lifecycle records', async () => {
      const created = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'no.records@test.local',
        password: 'NoRecords123',
        fullName: 'No Records',
        role: 'USER',
      });
      const id = created.body.data.user.id;

      const response = await as(fx.app, fx.admin).delete(`/api/users/${id}`);
      expect(response.status).toBe(200);
      expect(await prisma.user.count({ where: { id } })).toBe(0);
    });

    it('resets a user password administratively', async () => {
      const created = await as(fx.app, fx.admin).post('/api/users').send({
        email: 'reset.me@test.local',
        password: 'OriginalPass123',
        fullName: 'Reset Me',
        role: 'USER',
      });

      const response = await as(fx.app, fx.admin)
        .post(`/api/users/${created.body.data.user.id}/reset-password`)
        .send({ newPassword: 'AdminSetPass123' });
      expect(response.status).toBe(200);

      const ok = await anon(fx.app)
        .post('/api/auth/login')
        .send({ email: 'reset.me@test.local', password: 'AdminSetPass123' });
      expect(ok.status).toBe(200);
    });

    it('updates an agent profile and makes the change visible to the engine', async () => {
      const response = await as(fx.app, fx.admin)
        .patch(`/api/users/agents/${fx.agentNear.agentProfileId}`)
        .send({ vehicleCapacityKg: 650, maxDailyPickups: 15 });

      expect(response.status).toBe(200);
      expect(response.body.data.agentProfile.vehicleCapacityKg).toBe(650);
      expect(response.body.data.agentProfile.maxDailyPickups).toBe(15);
    });
  });

  describe('collection centre management', () => {
    it('creates, reads, updates and reports statistics for a centre', async () => {
      const created = await as(fx.app, fx.admin).post('/api/centers').send({
        name: 'Madurai Regional Centre',
        code: 'cc-mdu-01',
        addressLine: '5 Meenakshi Road',
        city: 'Madurai',
        state: 'Tamil Nadu',
        pincode: '625001',
        latitude: 9.9252,
        longitude: 78.1198,
        capacityKg: 7500,
        email: 'madurai@ecocycle.example',
      });

      expect(created.status).toBe(201);
      expect(created.body.data.center.code).toBe('CC-MDU-01'); // normalised to upper case
      const id = created.body.data.center.id;

      const stats = await as(fx.app, fx.admin).get(`/api/centers/${id}/stats`);
      expect(stats.status).toBe(200);
      expect(stats.body.data.totalItems).toBe(0);
      expect(stats.body.data.capacityUtilizationPct).toBe(0);

      const updated = await as(fx.app, fx.admin).patch(`/api/centers/${id}`).send({ status: 'MAINTENANCE' });
      expect(updated.body.data.center.status).toBe('MAINTENANCE');

      const deleted = await as(fx.app, fx.admin).delete(`/api/centers/${id}`);
      expect(deleted.status).toBe(200);
    });

    it('rejects a duplicate centre code and an incomplete coordinate pair', async () => {
      const duplicate = await as(fx.app, fx.admin).post('/api/centers').send({
        name: 'Another Chennai Centre',
        code: fx.center.code,
        addressLine: '1 Duplicate Road',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
      });
      expect(duplicate.status).toBe(409);

      const halfCoordinates = await as(fx.app, fx.admin).post('/api/centers').send({
        name: 'Half Coordinates Centre',
        code: 'CC-HALF-1',
        addressLine: '2 Half Road',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
        latitude: 13.0,
      });
      expect(halfCoordinates.status).toBe(422);
    });

    it('refuses to delete a centre that is referenced by records', async () => {
      const response = await as(fx.app, fx.admin).delete(`/api/centers/${fx.center.id}`);
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/INACTIVE/);
    });
  });

  describe('category management', () => {
    it('creates a category and derives its slug from the name', async () => {
      const response = await as(fx.app, fx.admin).post('/api/categories').send({
        name: 'Solar Inverters & UPS',
        hazardLevel: 3,
        defaultPath: 'COMPONENT_RECOVERY',
      });

      expect(response.status).toBe(201);
      expect(response.body.data.category.slug).toBe('solar-inverters-ups');
      expect(response.body.data.category.hazardLevel).toBe(3);

      const duplicate = await as(fx.app, fx.admin).post('/api/categories').send({
        name: 'solar inverters & ups',
      });
      expect(duplicate.status).toBe(409);
    });

    it('validates the hazard level range', async () => {
      expect((await as(fx.app, fx.admin).post('/api/categories').send({ name: 'Too Hazardous', hazardLevel: 9 })).status).toBe(422);
      expect((await as(fx.app, fx.admin).post('/api/categories').send({ name: 'Not Hazardous', hazardLevel: 0 })).status).toBe(422);
    });

    it('refuses to delete a category still in use, and deactivates instead', async () => {
      const response = await as(fx.app, fx.admin).delete(`/api/categories/${fx.categories[0]!.id}`);
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/in use|still used/);

      const deactivated = await as(fx.app, fx.admin)
        .patch(`/api/categories/${fx.categories[0]!.id}`)
        .send({ isActive: false });
      expect(deactivated.body.data.category.isActive).toBe(false);

      // An inactive category can no longer be chosen for a submission.
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)] });
      expect(submission.status).toBe(409);

      await as(fx.app, fx.admin).patch(`/api/categories/${fx.categories[0]!.id}`).send({ isActive: true });
    });

    it('deletes an unused category', async () => {
      const created = await as(fx.app, fx.admin).post('/api/categories').send({ name: 'Temporary Category' });
      const id = created.body.data.category.id;
      expect((await as(fx.app, fx.admin).delete(`/api/categories/${id}`)).status).toBe(200);
      expect(await prisma.category.count({ where: { id } })).toBe(0);
    });
  });

  describe('analytics integrity', () => {
    it('reports counts that match the raw database rows', async () => {
      const summary = await as(fx.app, fx.admin).get('/api/analytics/summary');
      expect(summary.status).toBe(200);

      const [itemCount, pickupCount, batchCount, inspectionCount, recoverySum] = await Promise.all([
        prisma.ewasteItem.count(),
        prisma.pickupRequest.count(),
        prisma.processingBatch.count(),
        prisma.inspection.count(),
        prisma.recoveredMaterial.aggregate({ _sum: { quantityKg: true } }),
      ]);

      expect(summary.body.data.items.total).toBe(itemCount);
      expect(summary.body.data.pickups.total).toBe(pickupCount);
      expect(summary.body.data.batches.total).toBe(batchCount);
      expect(summary.body.data.inspections.completed).toBe(inspectionCount);
      expect(summary.body.data.recovery.quantityKg).toBeCloseTo(Number(recoverySum._sum.quantityKg ?? 0), 3);

      // Status breakdown must add up to the total.
      const statusSum = summary.body.data.items.byStatus.reduce(
        (sum: number, row: { count: number }) => sum + row.count,
        0,
      );
      expect(statusSum).toBe(itemCount);
    });

    it('returns a dense, ordered monthly series', async () => {
      const response = await as(fx.app, fx.admin).get('/api/analytics/monthly?months=3');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);
      const months = response.body.data.map((m: { month: string }) => m.month);
      expect([...months].sort()).toEqual(months);
      expect(months.every((m: string) => /^\d{4}-\d{2}$/.test(m))).toBe(true);
    });

    it('never returns cached or hard-coded figures: totals move with real writes', async () => {
      const before = await as(fx.app, fx.admin).get('/api/analytics/overview');
      const itemsBefore = before.body.data.summary.items.total;

      await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[1]!.id), itemPayload(fx.categories[1]!.id)] });

      const after = await as(fx.app, fx.admin).get('/api/analytics/overview');
      expect(after.body.data.summary.items.total).toBe(itemsBefore + 2);
    });

    it('exposes the assignment audit trail to administrators', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;

      await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' });

      const logs = await as(fx.app, fx.admin).get(`/api/pickups/${pickupId}/assignment-logs`);
      expect(logs.status).toBe(200);
      expect(logs.body.data.length).toBeGreaterThan(0);
      expect(logs.body.data[0].reason).toEqual(expect.any(String));
      expect(logs.body.data[0].assignedBy.role).toBe('ADMIN');

      const stats = await as(fx.app, fx.admin).get('/api/analytics/assignments');
      expect(stats.status).toBe(200);
      expect(stats.body.data.totalAttempts).toBeGreaterThan(0);
      expect(stats.body.data.successRatePct).toBeGreaterThan(0);
    });

    it('reports agent and recycler performance from real records', async () => {
      // Drive one pickup all the way to collection so the metric has a real row behind it.
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;

      await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' });
      const assigned = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });
      await as(fx.app, fx.agentNear).post(`/api/pickups/${pickupId}/accept`);
      const collected = await as(fx.app, fx.agentNear)
        .post(`/api/pickups/${pickupId}/collect`)
        .send({ collectedWeightKg: 4.25 });
      expect(collected.status).toBe(200);

      const agents = await as(fx.app, fx.admin).get('/api/analytics/agents');
      expect(agents.status).toBe(200);
      const agent = agents.body.data.find(
        (a: { agentProfileId: number }) => a.agentProfileId === assigned.agentId,
      );
      expect(agent.completedPickups).toBeGreaterThan(0);
      expect(agent.collectedWeightKg).toBeGreaterThan(0);
      expect(agent.completionRatePct).toBeGreaterThan(0);

      const recyclers = await as(fx.app, fx.admin).get('/api/analytics/recyclers');
      expect(recyclers.status).toBe(200);
      expect(recyclers.body.data.map((r: { organizationName: string }) => r.organizationName)).toContain(
        'Test Metals Recovery',
      );
    });

    it('never leaks password material through any analytics payload', async () => {
      const response = await as(fx.app, fx.admin).get('/api/analytics/overview');
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|\$2[aby]\$|\"password\"/i);
    });
  });

  describe('profile summaries', () => {
    it('returns only the caller own data at /auth/me', async () => {
      const response = await as(fx.app, fx.agentNear).get('/api/auth/me');
      expect(response.status).toBe(200);
      expect(response.body.data.user.agentProfile).not.toBeNull();
      expect(response.body.data.user.recyclerProfile).toBeNull();
      expect(JSON.stringify(response.body)).not.toMatch(/password/i);
    });

    it('confirms the seeded demo credentials work end to end', async () => {
      const login = await anon(fx.app).post('/api/auth/login').send({ email: fx.staff.email, password: TEST_PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe('CENTER_STAFF');
    });
  });
});
