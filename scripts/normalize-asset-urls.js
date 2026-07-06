// One-off fixup: image paths must be root-absolute (leading "/") so they
// resolve correctly from both the storefront (served at "/") and the admin
// panel (served at "/admin/") — a bare "products/x.png" resolves relative to
// whatever page it's rendered on, which breaks under /admin/.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const IMAGE_FIELDS = ['imageUrl', 'hoverImageUrl', 'editorialTallImageUrl', 'editorialWideImageUrl'];

function normalize(p) {
  if (!p) return p;
  if (p.startsWith('/') || /^https?:\/\//.test(p)) return p;
  return '/' + p;
}

async function main() {
  const products = await prisma.product.findMany();
  for (const p of products) {
    const data = {};
    for (const field of IMAGE_FIELDS) {
      const fixed = normalize(p[field]);
      if (fixed !== p[field]) data[field] = fixed;
    }
    if (Object.keys(data).length) {
      await prisma.product.update({ where: { id: p.id }, data });
      console.log(`fixed ${p.slug}: ${Object.keys(data).join(', ')}`);
    }
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
  if (settings) {
    const data = {};
    for (const field of ['logoUrl', 'bankQrImageUrl']) {
      const fixed = normalize(settings[field]);
      if (fixed !== settings[field]) data[field] = fixed;
    }
    if (Object.keys(data).length) {
      await prisma.siteSettings.update({ where: { id: 'singleton' }, data });
      console.log(`fixed settings: ${Object.keys(data).join(', ')}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
