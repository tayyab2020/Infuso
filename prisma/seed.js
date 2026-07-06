require('dotenv/config');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PRICE = 3850;

const products = [
  { slug: 'aether', name: 'AETHER', price: PRICE, stock: 100 },
  { slug: 'aria', name: 'ARIA', price: PRICE, stock: 100 },
  { slug: 'oudor', name: 'OUDOR', price: PRICE, stock: 100 },
];

async function main() {
  for (const p of products) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { name: p.name, price: p.price },
      create: p,
    });
  }
  console.log(`Seeded ${products.length} products.`);

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env to seed the admin user.');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log(`Seeded admin user: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
