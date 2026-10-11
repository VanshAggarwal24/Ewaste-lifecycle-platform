import { resetDatabase, seedFixture, as, anon, itemPayload, pickupPayload, TEST_PASSWORD, type Fixture } from '../helpers/testDb';
import { prisma } from '../../src/lib/prisma';

/**
 * =====================================================================================
 *  End-to-end lifecycle test
 * =====================================================================================
 *  Walks the exact business process the platform exists to track, using real HTTP calls
 *  against a real PostgreSQL database, and asserts the persisted state after every step:
 *
 *    1. a citizen submits items
 *    2. a pickup request is created and an agent is assigned by the rule-based engine
 *    3. the agent accepts and records collection
 *    4. the centre confirms receipt
 *    5. staff inspect and classify the items
 *    6. eligible items are placed in a processing batch
 *    7. the batch is released to a recycler
 *    8. the recycler records processed quantities and material recovery
 *    9. the complete timestamped lifecycle is exposed by the API
 * =====================================================================================
 */
describe('E2E lifecycle: submission → recycling', () => {
  let fx: Fixture;
  let pickupId: number;
  let itemIds: number[] = [];
  const requestCodePattern = /^PR-\d{4}-\d{5}$/;

  beforeAll(async () => {
    await resetDatabase();
    fx = await seedFixture();
  });

  it('step 0 — rejects unauthenticated access to the workflow', async () => {
    const response = await anon(fx.app).get('/api/items');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('step 1 — a citizen submits two items together with a pickup request', async () => {
    const response = await as(fx.app, fx.citizen)
      .post('/api/items')
      .send({
        items: [
          itemPayload(fx.categories[0]!.id, { name: 'Dell Inspiron 15', estimatedWeightKg: 2.4 }),
          itemPayload(fx.categories[1]!.id, { name: 'Laptop Battery Pack', estimatedWeightKg: 0.8, quantity: 3 }),
        ],
        pickup: {
          ...pickupPayload(),
          estimatedWeightKg: 3.2,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.itemCount).toBe(2);
    expect(response.body.data.pickupRequest.id).toBeGreaterThan(0);

    pickupId = response.body.data.pickupRequest.id;
    itemIds = response.body.data.items.map((i: { id: number }) => i.id);

    expect(response.body.data.pickupRequest.requestCode).toMatch(requestCodePattern);

    // The items are immediately attached to the pickup and scheduled.
    const persisted = await prisma.ewasteItem.findMany({ where: { id: { in: itemIds } } });
    expect(persisted).toHaveLength(2);
    for (const item of persisted) {
      expect(item.status).toBe('PICKUP_SCHEDULED');
      expect(item.pickupRequestId).toBe(pickupId);
      expect(item.itemCode).toMatch(/^ITM-\d{4}-\d{5}$/);
      expect(Number(item.estimatedWeightKg)).toBeGreaterThan(0);
    }

    const request = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });
    expect(request.status).toBe('REQUESTED');
    expect(request.userId).toBe(fx.citizen.id);
    expect(Number(request.estimatedWeightKg)).toBe(3.2);
  });

  it('step 2a — the assignment engine previews its decision without writing anything', async () => {
    const before = await prisma.assignmentLog.count();
    const response = await as(fx.app, fx.admin).get(`/api/pickups/${pickupId}/assignment-preview`);

    expect(response.status).toBe(200);
    expect(response.body.data.locationSource).toBe('COORDINATES');
    expect(response.body.data.recommended).toBeTruthy();
    expect(response.body.data.recommended.agentProfileId).toBe(fx.agentNear.agentProfileId);
    expect(response.body.data.eligibleCandidates).toBe(1); // the at-capacity and distant agents are filtered out
    expect(await prisma.assignmentLog.count()).toBe(before); // dry run writes nothing
  });

  it('step 2b — automatic assignment picks the eligible agent and records why', async () => {
    const response = await as(fx.app, fx.admin)
      .post(`/api/pickups/${pickupId}/assign`)
      .send({ method: 'AUTO' });

    expect(response.status).toBe(200);
    expect(response.body.data.assigned).toBe(true);
    expect(response.body.data.agent.agentProfileId).toBe(fx.agentNear.agentProfileId);
    expect(response.body.data.reason).toMatch(/score/);

    const request = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });
    expect(request.status).toBe('ASSIGNED');
    expect(request.agentId).toBe(fx.agentNear.agentProfileId);
    expect(request.assignedAt).toBeInstanceOf(Date);

    // Agent workload counter is maintained transactionally.
    const profile = await prisma.agentProfile.findUniqueOrThrow({ where: { id: fx.agentNear.agentProfileId } });
    expect(profile.currentLoadCount).toBe(1);

    // Every step is written to the append-only audit trail.
    const history = await prisma.statusHistory.findMany({ where: { pickupRequestId: pickupId } });
    expect(history.map((h) => h.status)).toEqual(expect.arrayContaining(['REQUESTED', 'ASSIGNED']));
    const assignmentLog = await prisma.assignmentLog.findFirst({ where: { pickupRequestId: pickupId } });
    expect(assignmentLog?.outcome).toBe('ASSIGNED');
    expect(Number(assignmentLog?.score)).toBeGreaterThan(0);
  });

  it('step 2c — the agent sees the pickup on their dashboard', async () => {
    const response = await as(fx.app, fx.agentNear).get('/api/dashboard');
    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('COLLECTION_AGENT');
    expect(response.body.data.activePickups).toHaveLength(1);
    expect(response.body.data.activePickups[0].id).toBe(pickupId);
    expect(response.body.data.profile.currentLoadCount).toBe(1);
  });

  it('step 3a — the assigned agent accepts the assignment', async () => {
    const response = await as(fx.app, fx.agentNear).post(`/api/pickups/${pickupId}/accept`);

    expect(response.status).toBe(200);
    expect(response.body.data.pickupRequest.status).toBe('ACCEPTED');

    const request = await prisma.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });
    expect(request.status).toBe('ACCEPTED');
    expect(request.acceptedAt).toBeInstanceOf(Date);
  });

  it('step 3b — the agent records the collection, advancing the items too', async () => {
    const response = await as(fx.app, fx.agentNear)
      .post(`/api/pickups/${pickupId}/collect`)
      .send({ collectedWeightKg: 3.1, notes: 'Items weighed on site' });

    expect(response.status).toBe(200);
    expect(response.body.data.pickupRequest.status).toBe('COLLECTED');
    expect(response.body.data.pickupRequest.collectedWeightKg).toBe(3.1);

    const items = await prisma.ewasteItem.findMany({ where: { pickupRequestId: pickupId } });
    expect(items.every((i) => i.status === 'COLLECTED')).toBe(true);

    // The agent's open-pickup counter is released once the job is physically done.
    const profile = await prisma.agentProfile.findUniqueOrThrow({ where: { id: fx.agentNear.agentProfileId } });
    expect(profile.currentLoadCount).toBe(0);
  });

  it('step 4 — centre staff confirm receipt and the items become inspectable', async () => {
    const response = await as(fx.app, fx.staff)
      .post(`/api/pickups/${pickupId}/receive`)
      .send({ notes: 'Delivery received at the gate' });

    expect(response.status).toBe(200);
    expect(response.body.data.pickupRequest.status).toBe('RECEIVED_AT_CENTER');
    expect(response.body.data.pickupRequest.centerId).toBe(fx.center.id);

    const items = await prisma.ewasteItem.findMany({ where: { pickupRequestId: pickupId } });
    expect(items.every((i) => i.status === 'RECEIVED_AT_CENTER')).toBe(true);
    expect(items.every((i) => i.centerId === fx.center.id)).toBe(true);

    const pending = await as(fx.app, fx.staff).get('/api/items/pending-inspection');
    expect(pending.status).toBe(200);
    expect(pending.body.data).toHaveLength(2);
  });

  it('step 5 — staff inspect and classify each item', async () => {
    const first = await as(fx.app, fx.staff)
      .post(`/api/items/${itemIds[0]}/inspect`)
      .send({
        condition: 'REPAIRABLE',
        qualityScore: 82,
        actualWeightKg: 2.4,
        isRepairable: true,
        dataWipeRequired: true,
        dataWipeDone: true,
        remarks: 'Keyboard replaced, chassis intact.',
      });

    expect(first.status).toBe(201);
    expect(first.body.data.inspection.qualityGrade).toBe('B'); // 82 → grade B
    expect(first.body.data.inspection.processingPath).toBe('REFURBISHMENT'); // repairable + score ≥ 70
    expect(first.body.data.inspection.centerId).toBe(fx.center.id);

    const second = await as(fx.app, fx.staff)
      .post(`/api/items/${itemIds[1]}/inspect`)
      .send({
        condition: 'SEVERELY_DAMAGED',
        qualityScore: 31,
        actualWeightKg: 2.2,
        isRepairable: false,
        hazardFlag: true,
      });

    expect(second.status).toBe(201);
    expect(second.body.data.inspection.qualityGrade).toBe('D');
    expect(second.body.data.inspection.processingPath).toBe('MATERIAL_RECOVERY');

    const items = await prisma.ewasteItem.findMany({ where: { id: { in: itemIds } } });
    expect(items.every((i) => i.status === 'INSPECTED')).toBe(true);

    // The inspection is part of the item's own history.
    const history = await prisma.statusHistory.findMany({ where: { itemId: itemIds[0] } });
    expect(history.map((h) => h.status)).toContain('INSPECTED');
  });

  let batchId: number;

  it('step 6 — eligible items are placed into a processing batch', async () => {
    const batchable = await as(fx.app, fx.staff).get('/api/batches/batchable-items');
    expect(batchable.status).toBe(200);
    expect(batchable.body.data).toHaveLength(2);

    const created = await as(fx.app, fx.staff)
      .post('/api/batches')
      .send({
        name: 'Mixed recovery batch — E2E',
        itemIds: [itemIds[0], itemIds[1]],
        processingPath: 'MATERIAL_RECOVERY',
      });

    expect(created.status).toBe(201);
    batchId = created.body.data.batch.id;
    expect(created.body.data.batch.batchCode).toMatch(/^BAT-\d{4}-\d{5}$/);
    expect(created.body.data.batch.status).toBe('DRAFT');
    expect(created.body.data.batch.itemCount).toBe(2);
    expect(created.body.data.batch.itemWeightKg).toBeCloseTo(4.6, 2);

    const items = await prisma.ewasteItem.findMany({ where: { id: { in: itemIds } } });
    expect(items.every((i) => i.status === 'IN_BATCH')).toBe(true);

    const ready = await as(fx.app, fx.staff).post(`/api/batches/${batchId}/ready`);
    expect(ready.status).toBe(200);
    expect(ready.body.data.batch.status).toBe('READY');
  });

  it('step 7 — the batch is released to a recycler', async () => {
    const assigned = await as(fx.app, fx.staff)
      .post(`/api/batches/${batchId}/recycler`)
      .send({ recyclerId: fx.recycler.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.batch.recyclerId).toBe(fx.recycler.id);

    const released = await as(fx.app, fx.staff).post(`/api/batches/${batchId}/release`).send({});
    expect(released.status).toBe(200);
    expect(released.body.data.batch.status).toBe('RELEASED');
    expect(released.body.data.batch.releasedAt).toBeTruthy();

    // Items leave the centre batch area and enter processing custody.
    const items = await prisma.ewasteItem.findMany({ where: { id: { in: itemIds } } });
    expect(items.every((i) => i.status === 'PROCESSING')).toBe(true);

    const recyclerDashboard = await as(fx.app, fx.recycler).get('/api/dashboard');
    expect(recyclerDashboard.status).toBe(200);
    expect(recyclerDashboard.body.data.assignedBatches).toHaveLength(1);
    expect(recyclerDashboard.body.data.assignedBatches[0].id).toBe(batchId);
  });

  it('step 8 — the recycler records processing and material recovery', async () => {
    const started = await as(fx.app, fx.recycler).post(`/api/batches/${batchId}/start`);
    expect(started.status).toBe(200);
    expect(started.body.data.batch.status).toBe('IN_PROGRESS');

    const copper = await as(fx.app, fx.recycler)
      .post(`/api/batches/${batchId}/recoveries`)
      .send({ materialType: 'COPPER', quantityKg: 1.4, purityPct: 96.5, marketValuePerKg: 720, itemId: itemIds[1] });
    expect(copper.status).toBe(201);
    expect(copper.body.data.recovery.materialType).toBe('COPPER');

    const aluminium = await as(fx.app, fx.recycler)
      .post(`/api/batches/${batchId}/recoveries`)
      .send({ materialType: 'ALUMINIUM', quantityKg: 0.9, purityPct: 92 });
    expect(aluminium.status).toBe(201);

    const summary = await as(fx.app, fx.recycler).get(`/api/recoveries/by-material`);
    expect(summary.status).toBe(200);
    const total = summary.body.data.reduce((sum: number, row: { quantityKg: number }) => sum + row.quantityKg, 0);
    expect(total).toBeCloseTo(2.3, 3);

    const completed = await as(fx.app, fx.recycler)
      .post(`/api/batches/${batchId}/complete`)
      .send({ actualWeightKg: 4.6 });
    expect(completed.status).toBe(200);
    expect(completed.body.data.batch.status).toBe('COMPLETED');
    expect(completed.body.data.batch.completedAt).toBeTruthy();

    // The whole batch, and every item in it, reaches the end of the lifecycle.
    const items = await prisma.ewasteItem.findMany({ where: { id: { in: itemIds } } });
    expect(items.every((i) => i.status === 'RECYCLED')).toBe(true);

    const persistedRecoveries = await prisma.recoveredMaterial.findMany({ where: { batchId } });
    expect(persistedRecoveries).toHaveLength(2);
    const recoveredWeight = persistedRecoveries.reduce((sum, r) => sum + Number(r.quantityKg), 0);
    expect(recoveredWeight).toBeCloseTo(2.3, 3);
  });

  it('step 9 — the citizen sees the complete, timestamped lifecycle of their item', async () => {
    const response = await as(fx.app, fx.citizen).get(`/api/items/${itemIds[0]}/timeline`);

    expect(response.status).toBe(200);
    const statuses = response.body.data.map((e: { status: string }) => e.status);

    // Every milestone of the journey appears, in order.
    expect(statuses).toEqual(
      expect.arrayContaining([
        'PICKUP_SCHEDULED',
        'REQUESTED',
        'ASSIGNED',
        'ACCEPTED',
        'COLLECTED',
        'RECEIVED_AT_CENTER',
        'INSPECTED',
        'IN_BATCH',
        'PROCESSING',
        'RECYCLED',
      ]),
    );

    // Events are ordered chronologically and every one is timestamped.
    const timestamps: number[] = response.body.data.map((e: { createdAt: string }) => new Date(e.createdAt).getTime());
    expect([...timestamps].sort((a: number, b: number) => a - b)).toEqual(timestamps);
    expect(timestamps.every((t) => Number.isFinite(t))).toBe(true);

    // The timeline includes events from the pickup and the batch, not just the item itself.
    const subjects = new Set(response.body.data.map((e: { subject: string }) => e.subject));
    expect(subjects.has('ITEM')).toBe(true);
    expect(subjects.has('PICKUP_REQUEST')).toBe(true);
    expect(subjects.has('BATCH')).toBe(true);
  });

  it('step 9b — the item detail endpoint reflects the final, recycled state', async () => {
    const response = await as(fx.app, fx.citizen).get(`/api/items/${itemIds[1]}`);

    expect(response.status).toBe(200);
    const item = response.body.data.item;
    expect(item.status).toBe('RECYCLED');
    expect(item.inspection.condition).toBe('SEVERELY_DAMAGED');
    expect(item.inspection.qualityGrade).toBe('D');
    expect(item.batchItem.batch.batchCode).toMatch(/^BAT-/);
    expect(item.batchItem.batch.status).toBe('COMPLETED');
  });

  it('step 9c — the citizen dashboard reports their own recycled volume', async () => {
    const response = await as(fx.app, fx.citizen).get('/api/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.data.summary.items.total).toBe(2);
    expect(response.body.data.summary.recovery.quantityKg).toBeGreaterThan(0);
    expect(response.body.data.recentItems).toHaveLength(2);
  });

  it('step 9d — aggregations agree with the raw rows in the database', async () => {
    const overview = await as(fx.app, fx.admin).get('/api/analytics/overview?months=6');
    expect(overview.status).toBe(200);

    const rawRecovered = await prisma.recoveredMaterial.aggregate({ _sum: { quantityKg: true }, _count: { _all: true } });
    expect(overview.body.data.summary.recovery.quantityKg).toBeCloseTo(Number(rawRecovered._sum.quantityKg), 3);
    expect(overview.body.data.summary.recovery.records).toBe(rawRecovered._count._all);

    const rawItems = await prisma.ewasteItem.count();
    expect(overview.body.data.summary.items.total).toBe(rawItems);

    // The monthly series always returns a dense, ordered set of buckets.
    expect(overview.body.data.monthly).toHaveLength(6);
    const months = overview.body.data.monthly.map((m: { month: string }) => m.month);
    expect([...months].sort()).toEqual(months);
    expect(overview.body.data.monthly.at(-1).submissions).toBe(2);
  });

  it('completes the collection-centre reporting chain', async () => {
    const centers = await as(fx.app, fx.admin).get('/api/analytics/centers');
    expect(centers.status).toBe(200);

    const chennai = centers.body.data.find((c: { id: number }) => c.id === fx.center.id);
    expect(chennai.itemsReceived).toBeGreaterThanOrEqual(2);
    expect(chennai.inspections).toBe(2);
    expect(chennai.batches).toBeGreaterThanOrEqual(1);
    expect(chennai.completedBatches).toBe(1);
    expect(chennai.recoveredWeightKg).toBeCloseTo(2.3, 3);
    expect(chennai.recoveryRatePct).toBeGreaterThan(0);
  });
});
