import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});

const prisma = new PrismaClient({ adapter });

async function addAdminAndFixSeed() {
  console.log('Adding admin user and additional seed data...');
  
  const password_hash = await bcrypt.hash('password123', 10);
  
  // 1. Find ADMIN role
  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  if (!adminRole) {
    console.error('ADMIN role not found! Run the main seed first.');
    return;
  }
  
  // 2. Upsert admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: { password_hash },
    create: {
      email: 'admin@test.com',
      password_hash,
      name: 'Admin User',
      role_id: adminRole.id,
    }
  });
  console.log('✅ Admin user created/updated:', admin.email);
  
  // 3. Add more categories for testing
  const extraCategories = [
    { name: 'Desktop Computers', description: 'Tower PCs and workstations' },
    { name: 'Monitors', description: 'LCD, LED, CRT displays' },
    { name: 'Tablets', description: 'iPads and Android tablets' },
    { name: 'Printers', description: 'Inkjet and laser printers' },
    { name: 'Cables & Peripherals', description: 'USB, HDMI, keyboards, mice' },
    { name: 'Televisions', description: 'CRT, LCD, Plasma, OLED TVs' },
  ];
  
  for (const cat of extraCategories) {
    await prisma.ewasteCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
    console.log(`✅ Category: ${cat.name}`);
  }
  
  // 4. Add more materials
  const extraMaterials = [
    { name: 'Gold', unit: 'kg' },
    { name: 'Silver', unit: 'kg' },
    { name: 'Aluminum', unit: 'kg' },
    { name: 'Iron / Steel', unit: 'kg' },
    { name: 'Lead', unit: 'kg' },
    { name: 'Plastic (ABS/PC)', unit: 'kg' },
  ];
  
  for (const mat of extraMaterials) {
    await prisma.recoverableMaterial.upsert({
      where: { name: mat.name },
      update: {},
      create: mat,
    });
    console.log(`✅ Material: ${mat.name}`);
  }
  
  console.log('\n✨ Seed patch complete! Test credentials:');
  console.log('  admin@test.com     / password123');
  console.log('  user@test.com      / password123');
  console.log('  agent@test.com     / password123');
  console.log('  staff@test.com     / password123');
  console.log('  recycler@test.com  / password123');
}

addAdminAndFixSeed()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
