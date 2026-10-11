import type { MaterialType, Role } from '@prisma/client';
import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../../src/lib/prisma';
import { hashPassword } from '../../src/utils/password';
import { signAuthToken } from '../../src/utils/jwt';
import { createApp } from '../../src/app';

/**
 * Test fixtures.
 *
 * `resetDatabase()` gives every test a clean, deterministic starting point; `seedFixture()`
 * then creates a realistic organisation (two centres, two agents, staff, a recycler, two
 * citizens) through the real data layer, so integration tests exercise the same constraints
 * as production traffic.
 */

export const TEST_PASSWORD = 'TestPass123';

const DOMAIN_TABLES = [
  'recovered_materials',
  'batch_items',
  'processing_batches',
  'inspections',
  'assignment_logs',
  'status_history',
  'ewaste_items',
  'pickup_requests',
  'agent_profiles',
  'recycler_profiles',
  'users',
  'categories',
  'collection_centers',
];

/**
 * Truncates the domain tables and restarts identity + business-code sequences.
 * `_prisma_migrations` is deliberately left alone: the schema stays in place.
 *
 * TRUNCATE is used (not DELETE) because `status_history` is append-only and would reject
 * row-level deletes — the guarantee that protects the audit trail in production is exactly
 * what makes a row-by-row cleanup impossible here.
 */
export async function resetDatabase(): Promise<void> {
  const tables = DOMAIN_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "pickup_request_code_seq" RESTART WITH 1001`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "ewaste_item_code_seq" RESTART WITH 1001`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "processing_batch_code_seq" RESTART WITH 1001`);
}

export interface Actor {
  id: number;
  email: string;
  role: Role;
  token: string;
}

export interface Fixture {
  app: Express;
  admin: Actor;
  citizen: Actor;
  otherCitizen: Actor;
  agentNear: Actor & { agentProfileId: number };
  agentFar: Actor & { agentProfileId: number };
  agentBusy: Actor & { agentProfileId: number };
  staff: Actor & { centerId: number };
  staffOtherCenter: Actor & { centerId: number };
  recycler: Actor & { recyclerProfileId: number };
  recyclerOther: Actor & { recyclerProfileId: number };
  center: { id: number; name: string; code: string };
  otherCenter: { id: number; name: string; code: string };
  categories: Array<{ id: number; name: string; slug: string; defaultPath: string }>;
}

async function createActor(params: {
  email: string;
  fullName: string;
  role: Role;
  passwordHash: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  staffedCenterId?: number | null;
}) {
  const user = await prisma.user.create({
    data: {
      email: params.email,
      passwordHash: params.passwordHash,
      fullName: params.fullName,
      role: params.role,
      city: params.city ?? 'Chennai',
      state: 'Tamil Nadu',
      addressLine: '1 Test Street',
      pincode: '600001',
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      staffedCenterId: params.staffedCenterId ?? null,
    },
  });

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    token: signAuthToken({ id: user.id, role: user.role, email: user.email }),
  };
}

export async function seedFixture(): Promise<Fixture> {
  const app = createApp();
  const passwordHash = await hashPassword(TEST_PASSWORD);

  // ---- centres ----------------------------------------------------------------------
  const center = await prisma.collectionCenter.create({
    data: {
      name: 'Chennai Test Centre',
      code: 'CC-TEST-01',
      addressLine: '10 Test Avenue',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      latitude: 13.0,
      longitude: 80.2,
      capacityKg: 10000,
      status: 'ACTIVE',
    },
  });

  const otherCenter = await prisma.collectionCenter.create({
    data: {
      name: 'Coimbatore Test Centre',
      code: 'CC-TEST-02',
      addressLine: '20 Remote Road',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      pincode: '641001',
      latitude: 11.0168,
      longitude: 76.9558,
      capacityKg: 5000,
      status: 'ACTIVE',
    },
  });

  // ---- categories -------------------------------------------------------------------
  const categorySpecs = [
    { name: 'Test Laptops', slug: 'test-laptops', hazardLevel: 3, defaultPath: 'REFURBISHMENT' as const },
    { name: 'Test Batteries', slug: 'test-batteries', hazardLevel: 5, defaultPath: 'MATERIAL_RECOVERY' as const },
    { name: 'Test Monitors', slug: 'test-monitors', hazardLevel: 4, defaultPath: 'MATERIAL_RECOVERY' as const },
  ];
  const categories = [];
  for (const spec of categorySpecs) {
    categories.push(await prisma.category.create({ data: { ...spec, isActive: true } }));
  }

  // ---- people -----------------------------------------------------------------------
  const admin = await createActor({
    email: 'admin@test.local',
    fullName: 'Admin Tester',
    role: 'ADMIN',
    passwordHash,
  });

  const citizen = await createActor({
    email: 'citizen@test.local',
    fullName: 'Citizen One',
    role: 'USER',
    passwordHash,
    latitude: 13.0067,
    longitude: 80.2206,
  });

  const otherCitizen = await createActor({
    email: 'citizen.two@test.local',
    fullName: 'Citizen Two',
    role: 'USER',
    passwordHash,
    latitude: 13.05,
    longitude: 80.25,
  });

  const staffUser = await createActor({
    email: 'staff@test.local',
    fullName: 'Staff Tester',
    role: 'CENTER_STAFF',
    passwordHash,
    staffedCenterId: center.id,
  });

  const staffOther = await createActor({
    email: 'staff.other@test.local',
    fullName: 'Staff Other Centre',
    role: 'CENTER_STAFF',
    passwordHash,
    staffedCenterId: otherCenter.id,
  });

  const agentNearUser = await createActor({
    email: 'agent.near@test.local',
    fullName: 'Agent Near',
    role: 'COLLECTION_AGENT',
    passwordHash,
    latitude: 13.01,
    longitude: 80.22,
  });
  const agentNearProfile = await prisma.agentProfile.create({
    data: {
      userId: agentNearUser.id,
      centerId: center.id,
      vehicleType: 'Cargo Van',
      vehicleCapacityKg: 300,
      maxDailyPickups: 10,
      isAvailable: true,
      isVerified: true,
      ratingAvg: 4.8,
      currentLoadCount: 0,
    },
  });

  const agentFarUser = await createActor({
    email: 'agent.far@test.local',
    fullName: 'Agent Far',
    role: 'COLLECTION_AGENT',
    passwordHash,
    latitude: 11.02,
    longitude: 76.96, // ~400 km away
  });
  const agentFarProfile = await prisma.agentProfile.create({
    data: {
      userId: agentFarUser.id,
      centerId: otherCenter.id, // different centre + outside the radius
      vehicleType: 'Truck',
      vehicleCapacityKg: 900,
      maxDailyPickups: 10,
      isAvailable: true,
      isVerified: true,
      ratingAvg: 4.9,
      currentLoadCount: 0,
    },
  });

  const agentBusyUser = await createActor({
    email: 'agent.busy@test.local',
    fullName: 'Agent At Capacity',
    role: 'COLLECTION_AGENT',
    passwordHash,
    latitude: 13.02,
    longitude: 80.23,
  });
  const agentBusyProfile = await prisma.agentProfile.create({
    data: {
      userId: agentBusyUser.id,
      centerId: center.id,
      vehicleType: 'Bike',
      vehicleCapacityKg: 40,
      maxDailyPickups: 2,
      isAvailable: true,
      isVerified: true,
      ratingAvg: 4.0,
      currentLoadCount: 2, // fully loaded: must be excluded by the eligibility filter
    },
  });

  const recyclerUser = await createActor({
    email: 'recycler@test.local',
    fullName: 'Recycler Tester',
    role: 'RECYCLER',
    passwordHash,
  });
  const recyclerProfile = await prisma.recyclerProfile.create({
    data: {
      userId: recyclerUser.id,
      organizationName: 'Test Metals Recovery',
      licenseNumber: 'TN-TEST-0001',
      acceptedMaterials: ['COPPER', 'ALUMINIUM', 'STEEL'] as MaterialType[],
      maxCapacityKg: 20000,
      isActive: true,
    },
  });

  const recyclerOtherUser = await createActor({
    email: 'recycler.other@test.local',
    fullName: 'Other Recycler',
    role: 'RECYCLER',
    passwordHash,
  });
  const recyclerOtherProfile = await prisma.recyclerProfile.create({
    data: {
      userId: recyclerOtherUser.id,
      organizationName: 'Unassigned Recycler Ltd',
      licenseNumber: 'TN-TEST-0002',
      acceptedMaterials: ['PLASTIC', 'GLASS'] as MaterialType[],
      maxCapacityKg: 5000,
      isActive: true,
    },
  });

  return {
    app,
    admin,
    citizen,
    otherCitizen,
    agentNear: { ...agentNearUser, agentProfileId: agentNearProfile.id },
    agentFar: { ...agentFarUser, agentProfileId: agentFarProfile.id },
    agentBusy: { ...agentBusyUser, agentProfileId: agentBusyProfile.id },
    staff: { ...staffUser, centerId: center.id },
    staffOtherCenter: { ...staffOther, centerId: otherCenter.id },
    recycler: { ...recyclerUser, recyclerProfileId: recyclerProfile.id },
    recyclerOther: { ...recyclerOtherUser, recyclerProfileId: recyclerOtherProfile.id },
    center: { id: center.id, name: center.name, code: center.code },
    otherCenter: { id: otherCenter.id, name: otherCenter.name, code: otherCenter.code },
    categories,
  };
}

/** Authenticated supertest request helper. */
export function as(app: Express, actor: { token: string }) {
  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${actor.token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${actor.token}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${actor.token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${actor.token}`),
  };
}

export const anon = (app: Express) => request(app);

/** Default item payload used across tests. */
export function itemPayload(categoryId: number, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Laptop',
    categoryId,
    brand: 'TestBrand',
    modelNumber: 'TB-1000',
    quantity: 1,
    estimatedWeightKg: 2.5,
    ...overrides,
  };
}

export function pickupPayload(overrides: Record<string, unknown> = {}) {
  const date = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return {
    address: {
      addressLine: '42 Test Lane, Guindy',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600032',
      latitude: 13.0067,
      longitude: 80.2206,
    },
    preferredDate: date.toISOString().slice(0, 10),
    timeSlot: '10:00 - 13:00',
    notes: 'Test pickup',
    ...overrides,
  };
}
