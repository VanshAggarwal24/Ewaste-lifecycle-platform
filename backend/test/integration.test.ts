import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { app, prisma } from '../src/index';

const runId = randomUUID();
const marker = `ecocycle-it-${runId}`;
const password = `Integration-${runId}`;
const roleNames = ['USER', 'COLLECTION_AGENT', 'CENTER_STAFF', 'RECYCLER', 'ADMIN'] as const;
type TestRole = (typeof roleNames)[number];

let server: ReturnType<typeof app.listen>;
let baseUrl = '';
let centerId = '';
let categoryId = 0;
let materialId = 0;
const users = new Map<TestRole, { id: string; token: string }>();

async function request(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text
    ? response.headers.get('content-type')?.includes('application/json')
      ? JSON.parse(text)
      : text
    : null;
  return { status: response.status, data };
}

async function login(email: string): Promise<{ status: number; data: any }> {
  return request('POST', '/api/auth/login', undefined, { email, password });
}

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  const [roles, category, material] = await Promise.all([
    prisma.role.findMany({ where: { name: { in: [...roleNames] } } }),
    prisma.ewasteCategory.findFirst({ orderBy: { id: 'asc' } }),
    prisma.recoverableMaterial.findFirst({ orderBy: { id: 'asc' } }),
  ]);
  assert.deepEqual(
    new Set(roles.map((role) => role.name)),
    new Set(roleNames),
    'all five lifecycle roles must already exist; tests never seed roles',
  );
  assert.ok(category, 'at least one existing e-waste category is required');
  assert.ok(material, 'at least one existing recoverable material is required');
  categoryId = category.id;
  materialId = material.id;

  const center = await prisma.collectionCenter.create({
    data: {
      name: `${marker}-center`,
      address: 'Integration test facility',
      latitude: 0,
      longitude: 0,
      capacity_kg: 100,
    },
  });
  centerId = center.id;

  const roleIds = new Map(roles.map((role) => [role.name, role.id]));
  const passwordHash = await bcrypt.hash(password, 4);
  for (const role of roleNames) {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${role.toLowerCase()}@example.invalid`,
        password_hash: passwordHash,
        name: `${marker} ${role}`,
        role_id: roleIds.get(role)!,
        latitude: role === 'COLLECTION_AGENT' ? 0 : null,
        longitude: role === 'COLLECTION_AGENT' ? 0 : null,
      },
    });
    users.set(role, { id: user.id, token: '' });
    if (role === 'COLLECTION_AGENT') {
      await prisma.collectionAgentProfile.create({
        data: { user_id: user.id, max_load_kg: 100 },
      });
    }
    if (role === 'CENTER_STAFF') {
      await prisma.centerStaffProfile.create({
        data: { user_id: user.id, center_id: center.id },
      });
    }
  }

  for (const role of roleNames) {
    const user = users.get(role)!;
    const result = await login(`${marker}-${role.toLowerCase()}@example.invalid`);
    assert.equal(result.status, 200, `${role} login should succeed`);
    assert.equal(result.data.role, role);
    user.token = result.data.token;
  }
});

after(async () => {
  try {
    const testUsers = await prisma.user.findMany({
      where: { email: { startsWith: marker } },
      select: { id: true },
    });
    const userIds = testUsers.map((user) => user.id);
    const testCenters = await prisma.collectionCenter.findMany({
      where: { name: { startsWith: marker } },
      select: { id: true },
    });
    const centerIds = testCenters.map((center) => center.id);
    const items = await prisma.ewasteItem.findMany({
      where: { OR: [{ user_id: { in: userIds } }, { pickup_request: { center_id: { in: centerIds } } }] },
      select: { id: true },
    });
    const itemIds = items.map((item) => item.id);
    const pickups = await prisma.pickupRequest.findMany({
      where: { OR: [{ user_id: { in: userIds } }, { center_id: { in: centerIds } }] },
      select: { id: true },
    });
    const pickupIds = pickups.map((pickup) => pickup.id);
    const batches = await prisma.processingBatch.findMany({
      where: { OR: [{ center_id: { in: centerIds } }, { recycler_id: { in: userIds } }] },
      select: { id: true },
    });
    const batchIds = batches.map((batch) => batch.id);

    await prisma.$transaction([
      prisma.materialRecovery.deleteMany({ where: { batch_id: { in: batchIds } } }),
      prisma.processingBatchItem.deleteMany({
        where: { OR: [{ batch_id: { in: batchIds } }, { item_id: { in: itemIds } }] },
      }),
      prisma.inspection.deleteMany({ where: { item_id: { in: itemIds } } }),
      prisma.statusHistory.deleteMany({ where: { item_id: { in: itemIds } } }),
      prisma.ewasteItem.deleteMany({ where: { id: { in: itemIds } } }),
      prisma.pickupRequest.deleteMany({ where: { id: { in: pickupIds } } }),
      prisma.processingBatch.deleteMany({ where: { id: { in: batchIds } } }),
      prisma.collectionAgentProfile.deleteMany({ where: { user_id: { in: userIds } } }),
      prisma.centerStaffProfile.deleteMany({ where: { user_id: { in: userIds } } }),
      prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } }),
      prisma.notification.deleteMany({ where: { user_id: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
      prisma.collectionCenter.deleteMany({ where: { id: { in: centerIds } } }),
    ]);
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await prisma.$disconnect();
  }
});

test('authentication, least-privilege registration, and role authorization', async () => {
  const missingAuth = await request('GET', '/api/pickups');
  assert.equal(missingAuth.status, 401);

  const invalidPassword = await request('POST', '/api/auth/login', undefined, {
    email: `${marker}-user@example.invalid`,
    password: 'incorrect',
  });
  assert.equal(invalidPassword.status, 400);

  for (const role of roleNames) {
    assert.ok(users.get(role)?.token, `${role} has an authenticated token`);
  }

  const userToken = users.get('USER')!.token;
  const deniedAnalytics = await request('GET', '/api/analytics/kpis', userToken);
  assert.equal(deniedAnalytics.status, 403);
  const deniedInspection = await request(
    'POST',
    '/api/inspections',
    userToken,
    { item_id: 'not-created' },
  );
  assert.equal(deniedInspection.status, 403);

  const registration = await request('POST', '/api/auth/register', undefined, {
    email: `${marker}-privilege-probe@example.invalid`,
    password,
    name: 'Privilege probe',
    roleName: 'ADMIN',
  });
  assert.equal(registration.status, 201);
  const registeredUser = await prisma.user.findUnique({
    where: { id: registration.data.userId },
    include: { role: true },
  });
  assert.equal(registeredUser?.role.name, 'USER', 'public registration cannot create privileged accounts');
});

test('item submission through collection, inspection, batch recovery, and analytics', async () => {
  const userToken = users.get('USER')!.token;
  const agentToken = users.get('COLLECTION_AGENT')!.token;
  const centerToken = users.get('CENTER_STAFF')!.token;
  const recyclerToken = users.get('RECYCLER')!.token;
  const adminToken = users.get('ADMIN')!.token;

  const submitted = await request('POST', '/api/ewaste', userToken, {
    category_id: categoryId,
    estimated_weight_kg: 3.5,
    condition: 'WORKING',
    center_id: centerId,
    pickup_latitude: 0,
    pickup_longitude: 0,
  });
  assert.equal(submitted.status, 201);
  const itemId = submitted.data.id as string;

  const itemAfterSubmit = await prisma.ewasteItem.findUnique({ where: { id: itemId } });
  assert.ok(itemAfterSubmit);
  assert.equal(itemAfterSubmit.status, 'PICKUP_REQUESTED');
  const pickup = await prisma.pickupRequest.findFirst({ where: { items: { some: { id: itemId } } } });
  assert.ok(pickup, 'submission creates an attached pickup request');

  const assigned = await request('POST', `/api/pickups/${pickup.id}/assign`, adminToken, {
    agent_id: users.get('COLLECTION_AGENT')!.id,
  });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.data));
  const assignedPickup = await prisma.pickupRequest.findUnique({ where: { id: pickup.id } });
  assert.equal(assignedPickup?.status, 'PICKUP_ASSIGNED');
  assert.equal(assignedPickup?.agent_id, users.get('COLLECTION_AGENT')!.id);
  const assignedItem = await prisma.ewasteItem.findUnique({ where: { id: itemId } });
  assert.equal(assignedItem?.status, 'PICKUP_ASSIGNED');

  const agentQueue = await request('GET', '/api/pickups', agentToken);
  assert.equal(agentQueue.status, 200);
  assert.ok(agentQueue.data.some((entry: any) => entry.id === pickup.id));
  const wrongRoleConfirmation = await request(
    'POST',
    `/api/pickups/${pickup.id}/confirm`,
    userToken,
    { actual_weight_kg: 4.25 },
  );
  assert.equal(wrongRoleConfirmation.status, 403);

  const collected = await request('POST', `/api/pickups/${pickup.id}/confirm`, agentToken, {
    actual_weight_kg: 4.25,
  });
  assert.equal(collected.status, 200);
  const agentAfterCollection = await prisma.collectionAgentProfile.findUnique({
    where: { user_id: users.get('COLLECTION_AGENT')!.id },
  });
  assert.equal(agentAfterCollection?.current_load_kg, 4.25);
  const collectedItem = await prisma.ewasteItem.findUnique({ where: { id: itemId } });
  assert.equal(collectedItem?.status, 'COLLECTED');
  assert.equal(collectedItem?.actual_weight_kg, 4.25);

  const received = await request('POST', `/api/pickups/${pickup.id}/receive`, centerToken);
  assert.equal(received.status, 200);
  const [centerAfterReceipt, agentAfterReceipt, receivedItem] = await Promise.all([
    prisma.collectionCenter.findUnique({ where: { id: centerId } }),
    prisma.collectionAgentProfile.findUnique({ where: { user_id: users.get('COLLECTION_AGENT')!.id } }),
    prisma.ewasteItem.findUnique({ where: { id: itemId } }),
  ]);
  assert.equal(centerAfterReceipt?.current_load_kg, 4.25);
  assert.equal(agentAfterReceipt?.current_load_kg, 0);
  assert.equal(receivedItem?.status, 'RECEIVED_AT_CENTER');

  const inspected = await request('POST', '/api/inspections', centerToken, {
    item_id: itemId,
    physical_condition: 'MINOR_DAMAGE',
    functional_status: true,
    classification: 'RECYCLABLE',
    estimated_recoverable_weight_kg: 3,
  });
  assert.equal(inspected.status, 201);
  assert.equal((await prisma.ewasteItem.findUnique({ where: { id: itemId } }))?.status, 'INSPECTED');

  const createdBatch = await request('POST', '/api/batches', centerToken, {
    recycler_id: users.get('RECYCLER')!.id,
    item_ids: [itemId],
  });
  assert.equal(createdBatch.status, 201);
  const batchId = createdBatch.data.id as string;
  const [centerAfterBatch, batchItem] = await Promise.all([
    prisma.collectionCenter.findUnique({ where: { id: centerId } }),
    prisma.processingBatchItem.findUnique({ where: { batch_id_item_id: { batch_id: batchId, item_id: itemId } } }),
  ]);
  assert.equal(centerAfterBatch?.current_load_kg, 0);
  assert.equal(batchItem?.processed_weight_kg, 4.25);
  assert.equal((await prisma.ewasteItem.findUnique({ where: { id: itemId } }))?.status, 'PROCESSING');

  const recyclerBatches = await request('GET', '/api/batches', recyclerToken);
  assert.equal(recyclerBatches.status, 200);
  assert.ok(recyclerBatches.data.some((batch: any) => batch.id === batchId));
  const userBatches = await request('GET', '/api/batches', userToken);
  assert.equal(userBatches.status, 403);

  const invalidRecovery = await request('POST', `/api/batches/${batchId}/complete`, recyclerToken, {
    recoveries: [{ material_id: materialId, quantity_kg: 4.26 }],
  });
  assert.equal(invalidRecovery.status, 400);
  assert.equal((await prisma.processingBatch.findUnique({ where: { id: batchId } }))?.status, 'PENDING');

  const completed = await request('POST', `/api/batches/${batchId}/complete`, recyclerToken, {
    recoveries: [{ material_id: materialId, quantity_kg: 3.1 }],
  });
  assert.equal(completed.status, 200);
  const [finishedBatch, finishedItem, recovery] = await Promise.all([
    prisma.processingBatch.findUnique({ where: { id: batchId } }),
    prisma.ewasteItem.findUnique({ where: { id: itemId } }),
    prisma.materialRecovery.findFirst({ where: { batch_id: batchId } }),
  ]);
  assert.equal(finishedBatch?.status, 'COMPLETED');
  assert.equal(finishedItem?.status, 'RECYCLED');
  assert.equal(recovery?.quantity_kg, 3.1);

  const duplicateCompletion = await request('POST', `/api/batches/${batchId}/complete`, recyclerToken, {
    recoveries: [{ material_id: materialId, quantity_kg: 1 }],
  });
  assert.equal(duplicateCompletion.status, 409);
  assert.equal(await prisma.materialRecovery.count({ where: { batch_id: batchId } }), 1);

  const kpis = await request('GET', '/api/analytics/kpis', adminToken);
  assert.equal(kpis.status, 200);
  const collectedStatuses = [
    'COLLECTED',
    'RECEIVED_AT_CENTER',
    'INSPECTED',
    'PROCESSING',
    'RECYCLED',
    'REFURBISHED',
    'DISPOSED',
  ] as const;
  const collectedItems = await prisma.ewasteItem.findMany({
    where: { status: { in: [...collectedStatuses] } },
    select: { estimated_weight_kg: true, actual_weight_kg: true },
  });
  const expectedCollectedWeight = collectedItems.reduce(
    (sum, item) => sum + (item.actual_weight_kg ?? item.estimated_weight_kg),
    0,
  );
  const recoveryRows = await prisma.materialRecovery.findMany({ select: { quantity_kg: true } });
  const expectedRecoveredWeight = recoveryRows.reduce((sum, row) => sum + row.quantity_kg, 0);
  assert.equal(kpis.data.totalWeightCollected, expectedCollectedWeight);
  assert.equal(kpis.data.totalWeightRecycled, expectedRecoveredWeight);

  const chartData = await request('GET', '/api/analytics/charts', adminToken);
  assert.equal(chartData.status, 200);
  assert.ok(chartData.data.outcomes.some((outcome: any) => outcome.status === 'RECYCLED'));

  const history = await prisma.statusHistory.findMany({
    where: { item_id: itemId },
    select: { old_status: true, new_status: true },
  });
  for (const transition of [
    [null, 'SUBMITTED'],
    ['SUBMITTED', 'PICKUP_REQUESTED'],
    ['PICKUP_REQUESTED', 'PICKUP_ASSIGNED'],
    ['PICKUP_ASSIGNED', 'COLLECTED'],
    ['COLLECTED', 'RECEIVED_AT_CENTER'],
    ['RECEIVED_AT_CENTER', 'INSPECTED'],
    ['INSPECTED', 'PROCESSING'],
    ['PROCESSING', 'RECYCLED'],
  ]) {
    assert.ok(
      history.some((entry) => entry.old_status === transition[0] && entry.new_status === transition[1]),
      `status history should include ${transition.join(' -> ')}`,
    );
  }
});
