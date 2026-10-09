import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});

const prisma = new PrismaClient({ adapter });
async function main() {
  console.log('Seeding database...');
  
  // 1. Roles
  const roles = ['USER', 'COLLECTION_AGENT', 'CENTER_STAFF', 'RECYCLER', 'ADMIN'];
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: { name: role }
    });
  }

  const userRole = await prisma.role.findUnique({ where: { name: 'USER' } });
  const agentRole = await prisma.role.findUnique({ where: { name: 'COLLECTION_AGENT' } });
  const centerStaffRole = await prisma.role.findUnique({ where: { name: 'CENTER_STAFF' } });
  const recyclerRole = await prisma.role.findUnique({ where: { name: 'RECYCLER' } });
  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  
  if (!userRole || !agentRole || !centerStaffRole || !recyclerRole || !adminRole) throw new Error('Roles missing');

  // 2. Categories
  const cat1 = await prisma.ewasteCategory.upsert({
    where: { name: 'Laptops' },
    update: {},
    create: { name: 'Laptops', description: 'Portable computers' }
  });

  const cat2 = await prisma.ewasteCategory.upsert({
    where: { name: 'Smartphones' },
    update: {},
    create: { name: 'Smartphones', description: 'Mobile phones' }
  });

  // 3. Collection Centers
  const center = await prisma.collectionCenter.create({
    data: {
      name: 'Main E-Waste Hub',
      address: '123 Green Avenue',
      latitude: 40.7128,
      longitude: -74.0060,
      capacity_kg: 5000,
      current_load_kg: 0
    }
  });

  // 4. Users
  const password_hash = await bcrypt.hash('password123', 10);
  
  const testUser = await prisma.user.upsert({
    where: { email: 'user@test.com' },
    update: {},
    create: {
      email: 'user@test.com',
      password_hash,
      name: 'John Doe',
      role_id: userRole.id,
      latitude: 40.7130,
      longitude: -74.0070
    }
  });

  const agent = await prisma.user.upsert({
    where: { email: 'agent@test.com' },
    update: {},
    create: {
      email: 'agent@test.com',
      password_hash,
      name: 'Agent Smith',
      role_id: agentRole.id,
      latitude: 40.7140,
      longitude: -74.0080
    }
  });

  await prisma.collectionAgentProfile.create({
    data: { user_id: agent.id, max_load_kg: 500, current_load_kg: 0 }
  });

  const staff = await prisma.user.upsert({
    where: { email: 'staff@test.com' },
    update: {},
    create: {
      email: 'staff@test.com',
      password_hash,
      name: 'Staff Member',
      role_id: centerStaffRole.id
    }
  });

  await prisma.centerStaffProfile.create({
    data: { user_id: staff.id, center_id: center.id }
  });

  const recycler = await prisma.user.upsert({
    where: { email: 'recycler@test.com' },
    update: {},
    create: {
      email: 'recycler@test.com',
      password_hash,
      name: 'Recycle Corp',
      role_id: recyclerRole.id
    }
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      password_hash,
      name: 'Admin User',
      role_id: adminRole.id
    }
  });

  // 5. Materials
  const copper = await prisma.recoverableMaterial.upsert({
    where: { name: 'Copper' },
    update: {},
    create: { name: 'Copper', unit: 'kg' }
  });

  // 6. E-waste Item -> Pickup -> Collected
  const pickup = await prisma.pickupRequest.create({
    data: {
      user_id: testUser.id,
      center_id: center.id,
      status: 'COLLECTED',
      agent_id: agent.id,
      collected_at: new Date(),
      latitude: 40.7130,
      longitude: -74.0070
    }
  });

  const item = await prisma.ewasteItem.create({
    data: {
      user_id: testUser.id,
      category_id: cat1.id,
      pickup_request_id: pickup.id,
      estimated_weight_kg: 2.5,
      actual_weight_kg: 2.5,
      status: 'COLLECTED'
    }
  });

  console.log('Seeding completed.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
