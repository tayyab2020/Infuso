// One-off: existing orders got plain '1'..'9' from the old integer column
// after the type-cast migration — replace them with real alphanumeric codes.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { generateOrderNumber } = require('../src/lib/orderNumber');

const prisma = new PrismaClient();
const NUMERIC_RE = /^\d+$/;

async function main() {
  const orders = await prisma.order.findMany({
    where: { orderNumber: { not: undefined } },
    orderBy: { createdAt: 'asc' },
  });
  for (const order of orders) {
    if (!NUMERIC_RE.test(order.orderNumber)) continue; // already alphanumeric, skip
    let code;
    for (;;) {
      code = generateOrderNumber();
      const clash = await prisma.order.findUnique({ where: { orderNumber: code } });
      if (!clash) break;
    }
    await prisma.order.update({ where: { id: order.id }, data: { orderNumber: code } });
    console.log(`${order.orderNumber} -> ${code}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
