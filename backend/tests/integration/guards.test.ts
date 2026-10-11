import { as, itemPayload, pickupPayload, resetDatabase, seedFixture, type Fixture } from '../helpers/testDb';
import { prisma } from '../../src/lib/prisma';

/**
 * Business-rule guards: duplicate prevention, illegal transitions and edge cases in the
 * assignment engine. These are the rules that make the recorded lifecycle trustworthy —
 * without them the platform would happily store a contradiction such as two inspections of
 * the same item or an item inside two batches.
 */
describe('lifecycle guards', () => {
  let fx: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fx = await seedFixture();
  });

  /** Walks a fresh item to RECEIVED_AT_CENTER at fx.center and returns the ids. */
  async function itemAtCenter(progressWeightKg = 2.5) {
    const submission = await as(fx.app, fx.citizen)
      .post('/api/items')
      .send({ items: [itemPayload(fx.categories[0]!.id, { estimatedWeightKg: progressWeightKg })], pickup: pickupPayload() });

    const pickupId: number = submission.body.data.pickupRequest.id;
    const itemId: number = submission.body.data.items[0].id;

    await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' });
    await as(fx.app, fx.agentNear).post(`/api/pickups/${pickupId}/accept`);
    await as(fx.app, fx.agentNear).post(`/api/pickups/${pickupId}/collect`).send({});
    await as(fx.app, fx.staff).post(`/api/pickups/${pickupId}/receive`).send({});

    return { pickupId, itemId };
  }

  const inspectionBody = {
    condition: 'FAULTY' as const,
    qualityScore: 60,
    actualWeightKg: 2.5,
    isRepairable: false,
  };

  describe('duplicate prevention', () => {
    it('refuses a second inspection of the same item (409)', async () => {
      const { itemId } = await itemAtCenter();

      expect((await as(fx.app, fx.staff).post(`/api/items/${itemId}/inspect`).send(inspectionBody)).status).toBe(201);

      const duplicate = await as(fx.app, fx.staff).post(`/api/items/${itemId}/inspect`).send(inspectionBody);
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.message).toMatch(/already been inspected/);
      expect(await prisma.inspection.count({ where: { itemId } })).toBe(1);
    });

    it('refuses to inspect an item that has not been received at a centre (409)', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)] });
      const itemId = submission.body.data.items[0].id;

      const response = await as(fx.app, fx.staff).post(`/api/items/${itemId}/inspect`).send(inspectionBody);
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/RECEIVED_AT_CENTER|not associated/i);
    });

    it('refuses to place the same item in two batches (409)', async () => {
      const { itemId } = await itemAtCenter();
      await as(fx.app, fx.staff).post(`/api/items/${itemId}/inspect`).send(inspectionBody);

      const first = await as(fx.app, fx.staff).post('/api/batches').send({ name: 'Batch One', itemIds: [itemId] });
      expect(first.status).toBe(201);

      const second = await as(fx.app, fx.staff).post('/api/batches').send({ name: 'Batch Two', itemIds: [itemId] });
      expect(second.status).toBe(409);
      expect(second.body.error.message).toMatch(/already part of batch/);

      expect(await prisma.batchItem.count({ where: { itemId } })).toBe(1);
    });

    it('refuses to batch an item that has not been inspected (409)', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)] });
      const itemId = submission.body.data.items[0].id;

      const response = await as(fx.app, fx.staff).post('/api/batches').send({ name: 'Premature', itemIds: [itemId] });
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/INSPECTED/);
    });

    it('enforces one recovery record per material type per batch', async () => {
      const { itemId } = await itemAtCenter();
      await as(fx.app, fx.staff).post(`/api/items/${itemId}/inspect`).send(inspectionBody);
      const batch = await as(fx.app, fx.staff).post('/api/batches').send({ name: 'Recovery Batch', itemIds: [itemId] });
      const batchId = batch.body.data.batch.id;

      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/ready`);
      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/recycler`).send({ recyclerId: fx.recycler.id });
      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/release`).send({});
      await as(fx.app, fx.recycler).post(`/api/batches/${batchId}/start`);

      const first = await as(fx.app, fx.recycler)
        .post(`/api/batches/${batchId}/recoveries`)
        .send({ materialType: 'COPPER', quantityKg: 1.2, purityPct: 95 });
      expect(first.status).toBe(201);

      const duplicate = await as(fx.app, fx.recycler)
        .post(`/api/batches/${batchId}/recoveries`)
        .send({ materialType: 'COPPER', quantityKg: 0.4 });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.message).toMatch(/already been recorded/);
      expect(await prisma.recoveredMaterial.count({ where: { batchId } })).toBe(1);

      // A different material is perfectly fine.
      const different = await as(fx.app, fx.recycler)
        .post(`/api/batches/${batchId}/recoveries`)
        .send({ materialType: 'STEEL', quantityKg: 0.7 });
      expect(different.status).toBe(201);
    });
  });

  describe('illegal status transitions', () => {
    it('refuses to collect before the agent accepts', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;

      await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' });

      const response = await as(fx.app, fx.agentNear).post(`/api/pickups/${pickupId}/collect`).send({});
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_TRANSITION');
      // From ASSIGNED the only legal moves are accept, fail or cancel.
      expect(response.body.error.details.allowed).toEqual(['ACCEPTED', 'FAILED', 'CANCELLED']);

      const request = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });
      expect(request.status).toBe('ASSIGNED'); // untouched
    });

    it('refuses to receive a pickup that was never collected', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;

      const response = await as(fx.app, fx.staff).post(`/api/pickups/${pickupId}/receive`).send({});
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('treats a completed batch as immutable and a recycled item as final', async () => {
      const { itemId } = await itemAtCenter();
      await as(fx.app, fx.staff).post(`/api/items/${itemId}/inspect`).send(inspectionBody);
      const batch = await as(fx.app, fx.staff).post('/api/batches').send({ name: 'Final Batch', itemIds: [itemId] });
      const batchId = batch.body.data.batch.id;

      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/ready`);
      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/recycler`).send({ recyclerId: fx.recycler.id });
      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/release`).send({});
      await as(fx.app, fx.recycler).post(`/api/batches/${batchId}/start`);
      await as(fx.app, fx.recycler)
        .post(`/api/batches/${batchId}/recoveries`)
        .send({ materialType: 'ALUMINIUM', quantityKg: 1 });
      await as(fx.app, fx.recycler).post(`/api/batches/${batchId}/complete`).send({});

      const item = await prisma.ewasteItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item.status).toBe('RECYCLED');

      // The recycler cannot revise recovery figures after completion.
      const recovery = await prisma.recoveredMaterial.findFirstOrThrow({ where: { batchId } });
      const update = await as(fx.app, fx.recycler)
        .patch(`/api/recoveries/${recovery.id}`)
        .send({ quantityKg: 99 });
      expect(update.status).toBe(409);
      expect(update.body.error.message).toMatch(/completed/i);

      // ... and the batch cannot be started again.
      const restart = await as(fx.app, fx.recycler).post(`/api/batches/${batchId}/start`);
      expect(restart.status).toBe(409);
    });

    it('refuses to remove an item from a released batch', async () => {
      const { itemId } = await itemAtCenter();
      await as(fx.app, fx.staff).post(`/api/items/${itemId}/inspect`).send(inspectionBody);
      const batch = await as(fx.app, fx.staff).post('/api/batches').send({ name: 'Released Batch', itemIds: [itemId] });
      const batchId = batch.body.data.batch.id;

      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/ready`);
      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/recycler`).send({ recyclerId: fx.recycler.id });
      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/release`).send({});

      const response = await as(fx.app, fx.staff).delete(`/api/batches/${batchId}/items/${itemId}`);
      expect(response.status).toBe(409);
      expect(await prisma.batchItem.count({ where: { batchId } })).toBe(1);
    });

    it('refuses to release a batch without a recycler, or an empty batch', async () => {
      const empty = await as(fx.app, fx.staff).post('/api/batches').send({ name: 'Empty Batch' });
      const emptyId = empty.body.data.batch.id;

      const ready = await as(fx.app, fx.staff).post(`/api/batches/${emptyId}/ready`);
      expect(ready.status).toBe(409); // no items
      expect(ready.body.error.message).toMatch(/at least one item/);

      const { itemId } = await itemAtCenter();
      await as(fx.app, fx.staff).post(`/api/items/${itemId}/inspect`).send(inspectionBody);
      const batch = await as(fx.app, fx.staff).post('/api/batches').send({ name: 'No Recycler Batch', itemIds: [itemId] });
      const batchId = batch.body.data.batch.id;
      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/ready`);

      const release = await as(fx.app, fx.staff).post(`/api/batches/${batchId}/release`).send({});
      expect(release.status).toBe(409);
      expect(release.body.error.message).toMatch(/Assign a recycler/);
    });

    it('refuses to complete a batch with no recovered material recorded', async () => {
      const { itemId } = await itemAtCenter();
      await as(fx.app, fx.staff).post(`/api/items/${itemId}/inspect`).send(inspectionBody);
      const batch = await as(fx.app, fx.staff).post('/api/batches').send({ name: 'No Recovery Batch', itemIds: [itemId] });
      const batchId = batch.body.data.batch.id;

      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/ready`);
      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/recycler`).send({ recyclerId: fx.recycler.id });
      await as(fx.app, fx.staff).post(`/api/batches/${batchId}/release`).send({});
      await as(fx.app, fx.recycler).post(`/api/batches/${batchId}/start`);

      const response = await as(fx.app, fx.recycler).post(`/api/batches/${batchId}/complete`).send({});
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/at least one recovered material/);

      const batch2 = await prisma.processingBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(batch2.status).toBe('IN_PROGRESS');
    });

    it('refuses to edit an item once it is scheduled for pickup', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const itemId = submission.body.data.items[0].id;

      const response = await as(fx.app, fx.citizen).patch(`/api/items/${itemId}`).send({ name: 'Renamed' });
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/PICKUP_SCHEDULED/);
    });

    it('refuses to cancel an item that belongs to a pickup request', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const itemId = submission.body.data.items[0].id;

      const response = await as(fx.app, fx.citizen).post(`/api/items/${itemId}/cancel`).send({});
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/Cancel the pickup request/);
    });

    it('refuses to delete an item that has entered the workflow', async () => {
      const { itemId } = await itemAtCenter();
      const response = await as(fx.app, fx.citizen).delete(`/api/items/${itemId}`);
      expect(response.status).toBe(409);
      expect(await prisma.ewasteItem.count({ where: { id: itemId } })).toBe(1);
    });

    it('rejects an inspection whose grade disagrees with the measured score (database CHECK)', async () => {
      // The API derives the grade from the score, so a mismatch can only be introduced by
      // writing directly — exactly what the CHECK constraint exists to catch.
      const { itemId } = await itemAtCenter();

      await expect(
        prisma.inspection.create({
          data: {
            itemId,
            centerId: fx.center.id,
            condition: 'FAULTY',
            qualityScore: 95,
            qualityGrade: 'D', // 95 must be grade A
            processingPath: 'MATERIAL_RECOVERY',
            actualWeightKg: 1,
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects an out-of-range quality score at the API boundary', async () => {
      const { itemId } = await itemAtCenter();
      const response = await as(fx.app, fx.staff)
        .post(`/api/items/${itemId}/inspect`)
        .send({ ...inspectionBody, qualityScore: 140 });

      expect(response.status).toBe(422);
    });

    it('rejects a repairable item routed to DISPOSAL', async () => {
      const { itemId } = await itemAtCenter();
      const response = await as(fx.app, fx.staff)
        .post(`/api/items/${itemId}/inspect`)
        .send({ ...inspectionBody, isRepairable: true, processingPath: 'DISPOSAL', qualityScore: 90 });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/repairable/);
    });
  });

  describe('assignment edge cases', () => {
    it('reports gracefully when no agent is eligible, and logs the attempt', async () => {
      // Take every agent out of service for the duration of this test.
      await prisma.agentProfile.updateMany({ data: { isAvailable: false } });

      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;

      const response = await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' });

      expect(response.status).toBe(200);
      expect(response.body.data.assigned).toBe(false);
      expect(response.body.data.reason).toMatch(/no eligible agent|No eligible/i);
      expect(response.body.data.candidatesEvaluated).toBeGreaterThan(0);

      // The request stays in the pool: no agent, no status change, but a full audit entry.
      const request = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });
      expect(request.status).toBe('REQUESTED');
      expect(request.agentId).toBeNull();

      const log = await prisma.assignmentLog.findFirstOrThrow({
        where: { pickupRequestId: pickupId },
        orderBy: { createdAt: 'desc' },
      });
      expect(log.outcome).toBe('NO_ELIGIBLE_AGENT');
      expect(Array.isArray(log.candidates)).toBe(true);

      await prisma.agentProfile.updateMany({ data: { isAvailable: true } });
      expect((await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' })).status).toBe(200);
    });

    it('refuses a manual assignment to an ineligible agent', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;

      // The at-capacity agent must be refused even when chosen explicitly.
      const response = await as(fx.app, fx.admin)
        .post(`/api/pickups/${pickupId}/assign`)
        .send({ method: 'MANUAL', agentId: fx.agentBusy.agentProfileId });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/at capacity/);
      expect((await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } })).agentId).toBeNull();
    });

    it('releases the previous agent slot when reassigning', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;

      await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' });
      expect((await prisma.agentProfile.findUniqueOrThrow({ where: { id: fx.agentNear.agentProfileId } })).currentLoadCount).toBeGreaterThan(0);

      // Manual reassignment to the same agent is a no-op conflict.
      const same = await as(fx.app, fx.admin)
        .post(`/api/pickups/${pickupId}/assign`)
        .send({ method: 'MANUAL', agentId: fx.agentNear.agentProfileId });
      expect(same.status).toBe(409);

      // Bring a second eligible agent online and reassign to them.
      await prisma.agentProfile.update({
        where: { id: fx.agentBusy.agentProfileId },
        data: { maxDailyPickups: 20, currentLoadCount: 0 },
      });

      const nearLoadBeforeReassignment = (
        await prisma.agentProfile.findUniqueOrThrow({ where: { id: fx.agentNear.agentProfileId } })
      ).currentLoadCount;

      const reassigned = await as(fx.app, fx.admin)
        .post(`/api/pickups/${pickupId}/assign`)
        .send({ method: 'MANUAL', agentId: fx.agentBusy.agentProfileId });
      expect(reassigned.status).toBe(200);

      const previous = await prisma.agentProfile.findUniqueOrThrow({ where: { id: fx.agentNear.agentProfileId } });
      expect(previous.currentLoadCount).toBe(nearLoadBeforeReassignment - 1); // slot released

      const log = await prisma.assignmentLog.findFirstOrThrow({
        where: { pickupRequestId: pickupId },
        orderBy: { createdAt: 'desc' },
      });
      expect(log.method).toBe('MANUAL');
    });

    it('refuses assignment of a request that is already collected', async () => {
      const { pickupId } = await itemAtCenter();

      const response = await as(fx.app, fx.admin)
        .post(`/api/pickups/${pickupId}/assign`)
        .send({ method: 'AUTO' });
      expect(response.status).toBe(409);
    });
  });

  describe('cancellation semantics', () => {
    it('returns scheduled items to the owner when a pickup is cancelled', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;
      const itemId = submission.body.data.items[0].id;

      const response = await as(fx.app, fx.citizen)
        .post(`/api/pickups/${pickupId}/cancel`)
        .send({ reason: 'Change of plans' });

      expect(response.status).toBe(200);
      expect(response.body.data.pickupRequest.status).toBe('CANCELLED');

      const item = await prisma.ewasteItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item.status).toBe('SUBMITTED');
      expect(item.pickupRequestId).toBe(pickupId); // the link is preserved for the audit trail
      expect(item.status).toBe('SUBMITTED');

      // A cancelled pickup cannot be cancelled twice.
      expect((await as(fx.app, fx.citizen).post(`/api/pickups/${pickupId}/cancel`).send({})).status).toBe(409);
    });

    it('lets the owner decline-free cancel only before collection', async () => {
      const { pickupId } = await itemAtCenter(); // already RECEIVED_AT_CENTER
      const response = await as(fx.app, fx.citizen).post(`/api/pickups/${pickupId}/cancel`).send({});
      expect(response.status).toBe(409);
    });
  });

  describe('agent failure path', () => {
    it('frees the agent slot and flags the request for reassignment', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;

      await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' });
      const claimed = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });

      const loadBeforeFailure = (
        await prisma.agentProfile.findUniqueOrThrow({ where: { id: claimed.agentId as number } })
      ).currentLoadCount;

      const response = await as(fx.app, fx.agentNear)
        .post(`/api/pickups/${pickupId}/fail`)
        .send({ reason: 'Address could not be located after two attempts' });

      expect(response.status).toBe(200);
      const request = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });
      expect(request.status).toBe('FAILED');
      expect(request.failureReason).toMatch(/two attempts/);
      expect(request.agentId).toBeNull();

      const profile = await prisma.agentProfile.findUniqueOrThrow({ where: { id: claimed.agentId as number } });
      expect(profile.currentLoadCount).toBe(loadBeforeFailure - 1);

      // A failed request can be reassigned.
      const reassigned = await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' });
      expect(reassigned.status).toBe(200);
      expect(reassigned.body.data.assigned).toBe(true);
    });

    it('lets the agent decline an assignment with a reason', async () => {
      const submission = await as(fx.app, fx.citizen)
        .post('/api/items')
        .send({ items: [itemPayload(fx.categories[0]!.id)], pickup: pickupPayload() });
      const pickupId = submission.body.data.pickupRequest.id;
      await as(fx.app, fx.admin).post(`/api/pickups/${pickupId}/assign`).send({ method: 'AUTO' });

      const response = await as(fx.app, fx.agentNear)
        .post(`/api/pickups/${pickupId}/decline`)
        .send({ reason: 'Vehicle in for servicing today' });

      expect(response.status).toBe(200);
      const request = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });
      expect(request.status).toBe('FAILED');
      expect(request.agentId).toBeNull();
    });
  });
});
