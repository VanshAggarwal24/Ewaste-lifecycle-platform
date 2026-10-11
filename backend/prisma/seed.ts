/**
 * =====================================================================================
 *  EcoCycle — safe, idempotent demo seed
 * =====================================================================================
 *  Run with:  npm run db:seed     (or `npx prisma db seed`)
 *
 *  Safety properties:
 *    * NEVER drops, truncates or resets the database, and never deletes user data.
 *    * Idempotent: running it twice leaves the same state (upserts + existence checks).
 *    * Refuses to run against a production database unless SEED_ALLOW_PRODUCTION=true.
 *
 *  It creates:
 *    - 7 e-waste categories
 *    - 2 collection centres
 *    - 1 administrator, 3 collection agents, 2 centre-staff, 2 recyclers, 3 citizens
 *    - a complete worked lifecycle (submission → pickup → collection → receipt →
 *      inspection → batch → release → processing → recovery) so every screen has data
 * =====================================================================================
 */
import { PrismaClient, type MaterialType, type Role, type User } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

/** Demo password for every seeded account. Change it after a real deployment. */
const DEMO_PASSWORD = 'Passw0rd123';

const CATEGORIES = [
  { name: 'Mobile Phones & Tablets', slug: 'mobile-phones-tablets', hazardLevel: 3, defaultPath: 'REFURBISHMENT', description: 'Handsets, tablets and their accessories. High reuse potential.' },
  { name: 'Laptops & Computers', slug: 'laptops-computers', hazardLevel: 3, defaultPath: 'REFURBISHMENT', description: 'Portable and desktop computing equipment, including peripherals.' },
  { name: 'Televisions & Monitors', slug: 'televisions-monitors', hazardLevel: 4, defaultPath: 'MATERIAL_RECOVERY', description: 'CRT and flat-panel displays. Contains leaded glass and mercury backlights.' },
  { name: 'Batteries & Power Cells', slug: 'batteries-power-cells', hazardLevel: 5, defaultPath: 'MATERIAL_RECOVERY', description: 'Lithium-ion, lead-acid and nickel cells. Fire and chemical hazard.' },
  { name: 'Home Appliances', slug: 'home-appliances', hazardLevel: 2, defaultPath: 'COMPONENT_RECOVERY', description: 'White goods and small kitchen appliances.' },
  { name: 'Networking Equipment', slug: 'networking-equipment', hazardLevel: 3, defaultPath: 'COMPONENT_RECOVERY', description: 'Routers, switches, modems and cabling infrastructure.' },
  { name: 'Printers & Scanners', slug: 'printers-scanners', hazardLevel: 3, defaultPath: 'COMPONENT_RECOVERY', description: 'Printing equipment, toner cartridges and scanners.' },
] as const;

const CENTERS = [
  {
    code: 'CC-CHN-01',
    name: 'Chennai Central Collection Hub',
    addressLine: '14 Anna Salai, Guindy Industrial Estate',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600032',
    latitude: 13.0067,
    longitude: 80.2206,
    phone: '+91 44 4000 1234',
    email: 'chennai.central@ecocycle.example',
    capacityKg: 12000,
  },
  {
    code: 'CC-BLR-01',
    name: 'Bengaluru South Processing Centre',
    addressLine: '88 Hosur Road, Electronic City Phase 1',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560100',
    latitude: 12.8452,
    longitude: 77.6602,
    phone: '+91 80 4123 9876',
    email: 'bengaluru.south@ecocycle.example',
    capacityKg: 9000,
  },
] as const;

interface SeedUserSpec {
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  city?: string;
  state?: string;
  addressLine?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  staffedCenterCode?: string;
  agent?: {
    centerCode: string;
    vehicleType: string;
    vehicleCapacityKg: number;
    maxDailyPickups: number;
    isAvailable?: boolean;
    isVerified?: boolean;
    ratingAvg?: number;
  };
  recycler?: {
    organizationName: string;
    licenseNumber: string;
    acceptedMaterials: MaterialType[];
    maxCapacityKg: number;
    contactPhone?: string;
  };
}

const USERS: SeedUserSpec[] = [
  {
    email: 'admin@ecocycle.test',
    fullName: 'Ananya Rao',
    role: 'ADMIN',
    phone: '+91 90000 10001',
    city: 'Chennai',
    state: 'Tamil Nadu',
    addressLine: '1 Platform Office, Anna Salai',
    pincode: '600002',
    latitude: 13.0604,
    longitude: 80.2496,
  },
  // ---- Collection agents -------------------------------------------------------------
  {
    email: 'agent.chennai@ecocycle.test',
    fullName: 'Karthik Subramanian',
    role: 'COLLECTION_AGENT',
    phone: '+91 90000 20001',
    city: 'Chennai',
    latitude: 13.0500,
    longitude: 80.2320,
    agent: { centerCode: 'CC-CHN-01', vehicleType: 'Mini Truck', vehicleCapacityKg: 500, maxDailyPickups: 12, ratingAvg: 4.6 },
  },
  {
    email: 'agent.guindy@ecocycle.test',
    fullName: 'Meera Krishnan',
    role: 'COLLECTION_AGENT',
    phone: '+91 90000 20002',
    city: 'Chennai',
    latitude: 13.0090,
    longitude: 80.2150,
    agent: { centerCode: 'CC-CHN-01', vehicleType: 'Cargo Van', vehicleCapacityKg: 250, maxDailyPickups: 10, ratingAvg: 4.9 },
  },
  {
    email: 'agent.bengaluru@ecocycle.test',
    fullName: 'Ravi Prasad',
    role: 'COLLECTION_AGENT',
    phone: '+91 90000 20003',
    city: 'Bengaluru',
    latitude: 12.9350,
    longitude: 77.6200,
    agent: { centerCode: 'CC-BLR-01', vehicleType: 'Pickup Truck', vehicleCapacityKg: 800, maxDailyPickups: 8, ratingAvg: 4.2 },
  },
  // ---- Centre staff ------------------------------------------------------------------
  {
    email: 'staff.chennai@ecocycle.test',
    fullName: 'Divya Menon',
    role: 'CENTER_STAFF',
    phone: '+91 90000 30001',
    city: 'Chennai',
    staffedCenterCode: 'CC-CHN-01',
  },
  {
    email: 'staff.bengaluru@ecocycle.test',
    fullName: 'Arjun Nair',
    role: 'CENTER_STAFF',
    phone: '+91 90000 30002',
    city: 'Bengaluru',
    staffedCenterCode: 'CC-BLR-01',
  },
  // ---- Recyclers ---------------------------------------------------------------------
  {
    email: 'recycler.greenmetals@ecocycle.test',
    fullName: 'Suresh Iyer',
    role: 'RECYCLER',
    phone: '+91 90000 40001',
    city: 'Chennai',
    recycler: {
      organizationName: 'GreenMetals Recovery Pvt Ltd',
      licenseNumber: 'TN-REC-2024-00871',
      acceptedMaterials: ['COPPER', 'ALUMINIUM', 'STEEL', 'GOLD', 'SILVER', 'RARE_EARTH'],
      maxCapacityKg: 25000,
      contactPhone: '+91 44 4455 8899',
    },
  },
  {
    email: 'recycler.ecodismantle@ecocycle.test',
    fullName: 'Fatima Sheikh',
    role: 'RECYCLER',
    phone: '+91 90000 40002',
    city: 'Chennai',
    recycler: {
      organizationName: 'EcoDismantle Solutions',
      licenseNumber: 'TN-REC-2024-01234',
      acceptedMaterials: ['PLASTIC', 'GLASS', 'BATTERY_CHEMICALS', 'STEEL', 'ALUMINIUM', 'OTHER'],
      maxCapacityKg: 18000,
      contactPhone: '+91 44 4455 7700',
    },
  },
  // ---- Citizens ----------------------------------------------------------------------
  {
    email: 'user.priya@ecocycle.test',
    fullName: 'Priya Sharma',
    role: 'USER',
    phone: '+91 90000 50001',
    city: 'Chennai',
    state: 'Tamil Nadu',
    addressLine: '22 Gandhi Street, Adyar',
    pincode: '600020',
    latitude: 13.0067,
    longitude: 80.2570,
  },
  {
    email: 'user.vikram@ecocycle.test',
    fullName: 'Vikram Desai',
    role: 'USER',
    phone: '+91 90000 50002',
    city: 'Chennai',
    state: 'Tamil Nadu',
    addressLine: '7 Mount Road, Teynampet',
    pincode: '600018',
    latitude: 13.0389,
    longitude: 80.2456,
  },
  {
    email: 'user.sneha@ecocycle.test',
    fullName: 'Sneha Reddy',
    role: 'USER',
    phone: '+91 90000 50003',
    city: 'Bengaluru',
    state: 'Karnataka',
    addressLine: '301 Whitefield Main Road',
    pincode: '560066',
    latitude: 12.9698,
    longitude: 77.7500,
  },
];

async function assertSafeToSeed() {
  if (process.env.SEED_ALLOW_PRODUCTION === 'true') return;
  const url = process.env.DATABASE_URL ?? '';
  const looksProduction = /prod/i.test(url) || process.env.NODE_ENV === 'production';
  if (looksProduction) {
    console.error(
      '✖ Refusing to seed: DATABASE_URL/NODE_ENV look like production.\n' +
        '  Set SEED_ALLOW_PRODUCTION=true if you are absolutely certain.',
    );
    process.exit(1);
  }
}

async function upsertUser(spec: SeedUserSpec, passwordHash: string): Promise<User> {
  // Idempotent: existing accounts keep their password so that re-running the seed does not
  // silently reset credentials someone may have already changed.
  const user = await prisma.user.upsert({
    where: { email: spec.email },
    update: {
      fullName: spec.fullName,
      role: spec.role,
      phone: spec.phone ?? null,
      city: spec.city ?? null,
      state: spec.state ?? null,
      addressLine: spec.addressLine ?? null,
      pincode: spec.pincode ?? null,
      latitude: spec.latitude ?? null,
      longitude: spec.longitude ?? null,
    },
    create: {
      email: spec.email,
      passwordHash,
      fullName: spec.fullName,
      role: spec.role,
      phone: spec.phone ?? null,
      city: spec.city ?? null,
      state: spec.state ?? null,
      addressLine: spec.addressLine ?? null,
      pincode: spec.pincode ?? null,
      latitude: spec.latitude ?? null,
      longitude: spec.longitude ?? null,
    },
  });

  if (spec.role === 'CENTER_STAFF' && spec.staffedCenterCode) {
    const center = await prisma.collectionCenter.findUnique({ where: { code: spec.staffedCenterCode } });
    if (center) {
      await prisma.user.update({ where: { id: user.id }, data: { staffedCenterId: center.id } });
    }
  }

  if (spec.role === 'COLLECTION_AGENT' && spec.agent) {
    const center = await prisma.collectionCenter.findUnique({ where: { code: spec.agent.centerCode } });
    await prisma.agentProfile.upsert({
      where: { userId: user.id },
      update: {
        centerId: center?.id ?? null,
        vehicleType: spec.agent.vehicleType,
        vehicleCapacityKg: spec.agent.vehicleCapacityKg,
        maxDailyPickups: spec.agent.maxDailyPickups,
        isAvailable: spec.agent.isAvailable ?? true,
        isVerified: spec.agent.isVerified ?? true,
        ratingAvg: spec.agent.ratingAvg ?? 0,
      },
      create: {
        userId: user.id,
        centerId: center?.id ?? null,
        vehicleType: spec.agent.vehicleType,
        vehicleCapacityKg: spec.agent.vehicleCapacityKg,
        maxDailyPickups: spec.agent.maxDailyPickups,
        isAvailable: spec.agent.isAvailable ?? true,
        isVerified: spec.agent.isVerified ?? true,
        ratingAvg: spec.agent.ratingAvg ?? 0,
      },
    });
  }

  if (spec.role === 'RECYCLER' && spec.recycler) {
    await prisma.recyclerProfile.upsert({
      where: { userId: user.id },
      update: {
        organizationName: spec.recycler.organizationName,
        licenseNumber: spec.recycler.licenseNumber,
        acceptedMaterials: spec.recycler.acceptedMaterials,
        maxCapacityKg: spec.recycler.maxCapacityKg,
        contactPhone: spec.recycler.contactPhone ?? null,
      },
      create: {
        userId: user.id,
        organizationName: spec.recycler.organizationName,
        licenseNumber: spec.recycler.licenseNumber,
        acceptedMaterials: spec.recycler.acceptedMaterials,
        maxCapacityKg: spec.recycler.maxCapacityKg,
        contactPhone: spec.recycler.contactPhone ?? null,
      },
    });
  }

  return user;
}

/** Next value of a business-code sequence, so seeded rows use the same numbering as the API. */
async function nextSeq(kind: 'pickup' | 'item' | 'batch'): Promise<number> {
  const table = kind === 'pickup' ? 'pickup_request_code_seq' : kind === 'item' ? 'ewaste_item_code_seq' : 'processing_batch_code_seq';
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT nextval('${table}') AS n`);
  return Number(rows[0].n);
}

const code = (prefix: string, n: number) => `${prefix}-${new Date().getUTCFullYear()}-${String(n).padStart(5, '0')}`;

async function main() {
  await assertSafeToSeed();

  console.log('▶ Seeding EcoCycle demo data (idempotent — no existing data is deleted)');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

  // ---- categories -------------------------------------------------------------------
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        hazardLevel: category.hazardLevel,
        defaultPath: category.defaultPath,
      },
      create: { ...category },
    });
  }
  console.log(`  ✓ ${CATEGORIES.length} categories`);

  // ---- centres ----------------------------------------------------------------------
  for (const center of CENTERS) {
    await prisma.collectionCenter.upsert({
      where: { code: center.code },
      update: { ...center },
      create: { ...center, status: 'ACTIVE' },
    });
  }
  console.log(`  ✓ ${CENTERS.length} collection centres`);

  // ---- users ------------------------------------------------------------------------
  for (const spec of USERS) {
    await upsertUser(spec, passwordHash);
  }
  console.log(`  ✓ ${USERS.length} accounts (password: ${DEMO_PASSWORD})`);

  // ---- demo lifecycle ---------------------------------------------------------------
  // Only created when the demo citizen has no items yet, so re-running the seed is safe.
  const priya = await prisma.user.findUniqueOrThrow({ where: { email: 'user.priya@ecocycle.test' } });
  const existingItems = await prisma.ewasteItem.count({ where: { userId: priya.id } });

  if (existingItems > 0) {
    console.log('  ℹ Demo lifecycle already present — skipping (idempotent)');
  } else {
    const categoryByName = new Map(
      (await prisma.category.findMany()).map((c) => [c.name, c] as const),
    );
    const chennai = await prisma.collectionCenter.findUniqueOrThrow({ where: { code: 'CC-CHN-01' } });
    const agentMeera = await prisma.agentProfile.findFirstOrThrow({
      where: { user: { email: 'agent.guindy@ecocycle.test' } },
    });
    const staffDivya = await prisma.user.findUniqueOrThrow({ where: { email: 'staff.chennai@ecocycle.test' } });
    const recyclerGreen = await prisma.user.findUniqueOrThrow({ where: { email: 'recycler.greenmetals@ecocycle.test' } });

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@ecocycle.test' } });
    const actor = { id: admin.id, role: 'ADMIN' as Role };

    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    const inDays = (n: number) => {
      const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    };

    // ---- 1. citizen submits three items + a pickup request -------------------------
    const requestCode = code('PR', await nextSeq('pickup'));
    const request = await prisma.pickupRequest.create({
      data: {
        requestCode,
        userId: priya.id,
        status: 'REQUESTED',
        addressLine: priya.addressLine ?? '22 Gandhi Street, Adyar',
        city: priya.city ?? 'Chennai',
        state: priya.state ?? 'Tamil Nadu',
        pincode: priya.pincode ?? '600020',
        latitude: priya.latitude,
        longitude: priya.longitude,
        preferredDate: inDays(2),
        timeSlot: '10:00 - 13:00',
        notes: 'Please call before arriving. Items are on the ground floor.',
        estimatedWeightKg: 41.5,
        createdAt: daysAgo(9),
      },
    });

    const itemSpecs = [
      { name: 'Dell Latitude 5490 Laptop', category: 'Laptops & Computers', brand: 'Dell', modelNumber: 'Latitude 5490', serialNumber: 'DL5490-88213', weight: 2.1, quantity: 1 },
      { name: 'Samsung 32" LED Television', category: 'Televisions & Monitors', brand: 'Samsung', modelNumber: 'UA32T4380', serialNumber: 'SM32-4471', weight: 6.4, quantity: 1 },
      { name: 'Li-ion Laptop Battery Pack', category: 'Batteries & Power Cells', brand: 'Generic', modelNumber: 'BAT-LI-6000', weight: 0.6, quantity: 4 },
    ];

    const items = [];
    for (const spec of itemSpecs) {
      const category = categoryByName.get(spec.category);
      if (!category) continue;
      const itemCode = code('ITM', await nextSeq('item'));
      const item = await prisma.ewasteItem.create({
        data: {
          itemCode,
          userId: priya.id,
          pickupRequestId: request.id,
          categoryId: category.id,
          name: spec.name,
          brand: spec.brand,
          modelNumber: spec.modelNumber,
          serialNumber: spec.serialNumber ?? null,
          quantity: spec.quantity,
          estimatedWeightKg: spec.weight,
          status: 'PICKUP_SCHEDULED',
          createdAt: daysAgo(9),
        },
      });
      items.push(item);
    }

    await prisma.statusHistory.createMany({
      data: [
        {
          entityType: 'PICKUP_REQUEST',
          pickupRequestId: request.id,
          status: 'REQUESTED',
          note: `Pickup requested for ${items.length} item(s), preferred date ${request.preferredDate.toISOString().slice(0, 10)}`,
          actorId: priya.id,
          actorRole: 'USER',
          createdAt: daysAgo(9),
        },
        ...items.map((item) => ({
          entityType: 'EWASTE_ITEM' as const,
          itemId: item.id,
          status: 'PICKUP_SCHEDULED',
          note: `Scheduled for pickup ${requestCode}`,
          actorId: priya.id,
          actorRole: 'USER' as Role,
          createdAt: daysAgo(9),
        })),
      ],
    });

    // ---- 2 & 3. assignment + agent acceptance + collection --------------------------
    await prisma.pickupRequest.update({
      where: { id: request.id },
      data: {
        agentId: agentMeera.id,
        centerId: chennai.id,
        status: 'COLLECTED',
        assignedAt: daysAgo(8),
        acceptedAt: daysAgo(8),
        collectedAt: daysAgo(7),
        collectedWeightKg: 27.5,
      },
    });
    await prisma.agentProfile.update({
      where: { id: agentMeera.id },
      data: { currentLoadCount: 0 },
    });
    await prisma.assignmentLog.create({
      data: {
        pickupRequestId: request.id,
        agentId: agentMeera.id,
        assignedById: admin.id,
        method: 'AUTO',
        outcome: 'ASSIGNED',
        score: 0.8125,
        distanceKm: 3.4,
        reason: `Selected ${agentMeera.userId} (seed) — nearest verified available agent with available capacity.`,
        createdAt: daysAgo(8),
      },
    });

    // ---- 4. centre confirms receipt --------------------------------------------------
    await prisma.pickupRequest.update({
      where: { id: request.id },
      data: { status: 'RECEIVED_AT_CENTER', receivedAt: daysAgo(6) },
    });
    await prisma.ewasteItem.updateMany({
      where: { pickupRequestId: request.id },
      data: { status: 'RECEIVED_AT_CENTER', centerId: chennai.id },
    });

    // ---- 5. staff inspect & classify -------------------------------------------------
    const inspectionSpecs = [
      { condition: 'REPAIRABLE' as const, score: 78, grade: 'B' as const, path: 'REFURBISHMENT' as const, weight: 2.1, repairable: true },
      { condition: 'FAULTY' as const, score: 55, grade: 'C' as const, path: 'MATERIAL_RECOVERY' as const, weight: 6.4, repairable: false },
      { condition: 'SEVERELY_DAMAGED' as const, score: 35, grade: 'D' as const, path: 'DISPOSAL' as const, weight: 2.4, repairable: false },
    ];

    for (const [index, item] of items.entries()) {
      const spec = inspectionSpecs[index];
      if (!spec) continue;
      await prisma.inspection.create({
        data: {
          itemId: item.id,
          centerId: chennai.id,
          inspectedById: staffDivya.id,
          condition: spec.condition,
          qualityScore: spec.score,
          qualityGrade: spec.grade,
          processingPath: spec.path,
          actualWeightKg: spec.weight,
          isRepairable: spec.repairable,
          hazardFlag: spec.path === 'MATERIAL_RECOVERY',
          dataWipeRequired: true,
          dataWipeDone: true,
          remarks: index === 0 ? 'Chassis intact, keyboard replaced, battery serviceable.' : 'Sorted into the material-recovery stream.',
          inspectedAt: daysAgo(5),
        },
      });
      await prisma.ewasteItem.update({ where: { id: item.id }, data: { status: 'INSPECTED' } });
    }

    // ---- 6. batch assembly -----------------------------------------------------------
    const batch1Code = code('BAT', await nextSeq('batch'));
    const batch1 = await prisma.processingBatch.create({
      data: {
        batchCode: batch1Code,
        centerId: chennai.id,
        recyclerId: recyclerGreen.id,
        createdById: staffDivya.id,
        name: 'Chennai mixed metals — week 12',
        status: 'IN_PROGRESS',
        processingPath: 'MATERIAL_RECOVERY',
        targetWeightKg: 8.5,
        actualWeightKg: 8.5,
        releasedAt: daysAgo(4),
        startedAt: daysAgo(3),
        createdAt: daysAgo(5),
      },
    });

    const [itemLaptop, itemTv, itemBattery] = items;

    await prisma.batchItem.create({
      data: { batchId: batch1.id, itemId: itemTv!.id, addedById: staffDivya.id, weightAtAdditionKg: 6.4, addedAt: daysAgo(5) },
    });
    await prisma.batchItem.create({
      data: { batchId: batch1.id, itemId: itemBattery!.id, addedById: staffDivya.id, weightAtAdditionKg: 2.4, addedAt: daysAgo(5) },
    });

    await prisma.ewasteItem.updateMany({
      where: { id: { in: [itemTv!.id, itemBattery!.id] } },
      data: { status: 'PROCESSING' },
    });

    // ---- 7 & 8. recycler records processing + material recovery -----------------------
    const recoverySpecs: Array<{ materialType: MaterialType; quantityKg: number; purity?: number; value?: number; itemId?: number }> = [
      { materialType: 'COPPER', quantityKg: 1.35, purity: 96.5, value: 720, itemId: itemTv!.id },
      { materialType: 'ALUMINIUM', quantityKg: 1.1, purity: 94, value: 210, itemId: itemTv!.id },
      { materialType: 'GLASS', quantityKg: 2.6, purity: 88, value: 12, itemId: itemTv!.id },
      { materialType: 'BATTERY_CHEMICALS', quantityKg: 1.9, purity: 72, value: 60, itemId: itemBattery!.id },
      { materialType: 'PLASTIC', quantityKg: 0.95, purity: 80, value: 18, itemId: itemBattery!.id },
    ];

    for (const spec of recoverySpecs) {
      await prisma.recoveredMaterial.create({
        data: {
          batchId: batch1.id,
          itemId: spec.itemId ?? null,
          recordedById: recyclerGreen.id,
          materialType: spec.materialType,
          quantityKg: spec.quantityKg,
          purityPct: spec.purity ?? null,
          marketValuePerKg: spec.value ?? null,
          notes: 'Weighed and assayed at intake.',
          recordedAt: daysAgo(2),
        },
      });
    }

    // ---- second batch: still at the centre, waiting for a recycler ---------------------
    const batch2Code = code('BAT', await nextSeq('batch'));
    const batch2 = await prisma.processingBatch.create({
      data: {
        batchCode: batch2Code,
        centerId: chennai.id,
        createdById: staffDivya.id,
        name: 'Refurbishment candidates — laptops',
        status: 'READY',
        processingPath: 'REFURBISHMENT',
        targetWeightKg: 2.1,
        createdAt: daysAgo(4),
      },
    });
    await prisma.batchItem.create({
      data: { batchId: batch2.id, itemId: itemLaptop!.id, addedById: staffDivya.id, weightAtAdditionKg: 2.1, addedAt: daysAgo(4) },
    });
    await prisma.ewasteItem.update({ where: { id: itemLaptop!.id }, data: { status: 'IN_BATCH' } });

    // ---- history for the whole journey ------------------------------------------------
    const historyRows: Array<{
      entityType: 'PICKUP_REQUEST' | 'EWASTE_ITEM' | 'PROCESSING_BATCH';
      pickupRequestId?: number;
      itemId?: number;
      batchId?: number;
      status: string;
      note: string;
      actorId?: number;
      actorRole?: Role;
      at: Date;
    }> = [
      { entityType: 'PICKUP_REQUEST', pickupRequestId: request.id, status: 'ASSIGNED', note: `Assigned to agent profile #${agentMeera.id} (automatic rule-based assignment)`, actorId: admin.id, actorRole: 'ADMIN', at: daysAgo(8) },
      { entityType: 'PICKUP_REQUEST', pickupRequestId: request.id, status: 'ACCEPTED', note: 'Collection agent accepted the assignment', actorId: agentMeera.userId, actorRole: 'COLLECTION_AGENT', at: daysAgo(8) },
      { entityType: 'PICKUP_REQUEST', pickupRequestId: request.id, status: 'COLLECTED', note: 'Items collected and weighed at pickup: 27.5 kg', actorId: agentMeera.userId, actorRole: 'COLLECTION_AGENT', at: daysAgo(7) },
      { entityType: 'PICKUP_REQUEST', pickupRequestId: request.id, status: 'RECEIVED_AT_CENTER', note: `Items received at ${chennai.name}`, actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(6) },
      ...items.map((item) => ({
        entityType: 'EWASTE_ITEM' as const,
        itemId: item.id,
        status: 'COLLECTED',
        note: 'Collected by the agent under pickup ' + requestCode,
        actorId: agentMeera.userId,
        actorRole: 'COLLECTION_AGENT' as Role,
        at: daysAgo(7),
      })),
      ...items.map((item) => ({
        entityType: 'EWASTE_ITEM' as const,
        itemId: item.id,
        status: 'RECEIVED_AT_CENTER',
        note: `Received at ${chennai.name}`,
        actorId: staffDivya.id,
        actorRole: 'CENTER_STAFF' as Role,
        at: daysAgo(6),
      })),
      ...items.map((item, index) => ({
        entityType: 'EWASTE_ITEM' as const,
        itemId: item.id,
        status: 'INSPECTED',
        note: `Inspected: grade ${inspectionSpecs[index]?.grade ?? 'C'}, path ${inspectionSpecs[index]?.path ?? 'MATERIAL_RECOVERY'}`,
        actorId: staffDivya.id,
        actorRole: 'CENTER_STAFF' as Role,
        at: daysAgo(5),
      })),
      { entityType: 'PROCESSING_BATCH', batchId: batch1.id, status: 'DRAFT', note: `Batch ${batch1Code} created at ${chennai.name}`, actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(5) },
      { entityType: 'EWASTE_ITEM', itemId: itemTv!.id, status: 'IN_BATCH', note: `Added to processing batch ${batch1Code}`, actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(5) },
      { entityType: 'EWASTE_ITEM', itemId: itemBattery!.id, status: 'IN_BATCH', note: `Added to processing batch ${batch1Code}`, actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(5) },
      { entityType: 'PROCESSING_BATCH', batchId: batch1.id, status: 'READY', note: 'Batch sealed and ready for release', actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(5) },
      { entityType: 'PROCESSING_BATCH', batchId: batch1.id, status: 'RELEASED', note: 'Batch released to GreenMetals Recovery Pvt Ltd', actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(4) },
      { entityType: 'EWASTE_ITEM', itemId: itemTv!.id, status: 'PROCESSING', note: `Released for processing in batch ${batch1Code}`, actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(4) },
      { entityType: 'EWASTE_ITEM', itemId: itemBattery!.id, status: 'PROCESSING', note: `Released for processing in batch ${batch1Code}`, actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(4) },
      { entityType: 'PROCESSING_BATCH', batchId: batch1.id, status: 'IN_PROGRESS', note: 'Processing started', actorId: recyclerGreen.id, actorRole: 'RECYCLER', at: daysAgo(3) },
      { entityType: 'PROCESSING_BATCH', batchId: batch1.id, status: 'IN_PROGRESS', note: 'Recovered 1.35 kg of COPPER at 96.5% purity', actorId: recyclerGreen.id, actorRole: 'RECYCLER', at: daysAgo(2) },
      { entityType: 'PROCESSING_BATCH', batchId: batch1.id, status: 'IN_PROGRESS', note: 'Recovered 1.1 kg of ALUMINIUM at 94% purity', actorId: recyclerGreen.id, actorRole: 'RECYCLER', at: daysAgo(2) },
      { entityType: 'PROCESSING_BATCH', batchId: batch1.id, status: 'IN_PROGRESS', note: 'Recovered 2.6 kg of GLASS at 88% purity', actorId: recyclerGreen.id, actorRole: 'RECYCLER', at: daysAgo(2) },
      { entityType: 'PROCESSING_BATCH', batchId: batch1.id, status: 'IN_PROGRESS', note: 'Recovered 1.9 kg of BATTERY_CHEMICALS at 72% purity', actorId: recyclerGreen.id, actorRole: 'RECYCLER', at: daysAgo(2) },
      { entityType: 'PROCESSING_BATCH', batchId: batch1.id, status: 'IN_PROGRESS', note: 'Recovered 0.95 kg of PLASTIC at 80% purity', actorId: recyclerGreen.id, actorRole: 'RECYCLER', at: daysAgo(2) },
      { entityType: 'PROCESSING_BATCH', batchId: batch2.id, status: 'DRAFT', note: `Batch ${batch2Code} created at ${chennai.name}`, actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(4) },
      { entityType: 'EWASTE_ITEM', itemId: itemLaptop!.id, status: 'IN_BATCH', note: `Added to processing batch ${batch2Code}`, actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(4) },
      { entityType: 'PROCESSING_BATCH', batchId: batch2.id, status: 'READY', note: 'Batch sealed and awaiting recycler assignment', actorId: staffDivya.id, actorRole: 'CENTER_STAFF', at: daysAgo(3) },
    ];

    await prisma.statusHistory.createMany({
      data: historyRows.map((row) => ({
        entityType: row.entityType,
        pickupRequestId: row.pickupRequestId ?? null,
        itemId: row.itemId ?? null,
        batchId: row.batchId ?? null,
        status: row.status,
        note: row.note,
        actorId: row.actorId ?? null,
        actorRole: row.actorRole ?? null,
        createdAt: row.at,
      })),
    });

    // ---- a second citizen's open request, to exercise the assignment screen ------------
    const vikram = await prisma.user.findUniqueOrThrow({ where: { email: 'user.vikram@ecocycle.test' } });
    const vikramCategory = categoryByName.get('Networking Equipment');
    const vikramRequestCode = code('PR', await nextSeq('pickup'));
    const vikramRequest = await prisma.pickupRequest.create({
      data: {
        requestCode: vikramRequestCode,
        userId: vikram.id,
        status: 'REQUESTED',
        addressLine: vikram.addressLine ?? '7 Mount Road, Teynampet',
        city: vikram.city ?? 'Chennai',
        state: vikram.state ?? 'Tamil Nadu',
        pincode: vikram.pincode ?? '600018',
        latitude: vikram.latitude,
        longitude: vikram.longitude,
        preferredDate: inDays(3),
        timeSlot: '14:00 - 17:00',
        notes: 'Two routers and a switch from a small office.',
        estimatedWeightKg: 7.2,
        createdAt: daysAgo(1),
      },
    });

    if (vikramCategory) {
      const itemCode = code('ITM', await nextSeq('item'));
      const vikramItem = await prisma.ewasteItem.create({
        data: {
          itemCode,
          userId: vikram.id,
          pickupRequestId: vikramRequest.id,
          categoryId: vikramCategory.id,
          name: 'Cisco 24-Port Gigabit Switch',
          brand: 'Cisco',
          modelNumber: 'SG250-24',
          quantity: 1,
          estimatedWeightKg: 3.2,
          status: 'PICKUP_SCHEDULED',
          createdAt: daysAgo(1),
        },
      });
      await prisma.statusHistory.createMany({
        data: [
          {
            entityType: 'PICKUP_REQUEST',
            pickupRequestId: vikramRequest.id,
            status: 'REQUESTED',
            note: 'Pickup requested — awaiting agent assignment',
            actorId: vikram.id,
            actorRole: 'USER',
            createdAt: daysAgo(1),
          },
          {
            entityType: 'EWASTE_ITEM',
            itemId: vikramItem.id,
            status: 'PICKUP_SCHEDULED',
            note: `Scheduled for pickup ${vikramRequestCode}`,
            actorId: vikram.id,
            actorRole: 'USER',
            createdAt: daysAgo(1),
          },
        ],
      });
    }

    console.log('  ✓ demo lifecycle: 1 completed delivery chain + 1 open pickup request');
  }

  console.log('\n✔ Seed complete. Demo accounts (password for all: ' + DEMO_PASSWORD + ')\n');
  console.table(
    USERS.map((u) => ({
      Role: u.role,
      Email: u.email,
      Name: u.fullName,
    })),
  );
  console.log('\nSign in at http://localhost:5173/login\n');
}

main()
  .catch((error) => {
    console.error('✖ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
