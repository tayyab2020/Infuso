// One-off: repoints already-populated Product image URL columns from the old
// PNG/JPG filenames to the newly-optimized WebP versions (see
// optimize-images.js). sync-storefront-content.js only fills null fields, so
// it can't update these existing values — this does that part.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const UPDATES = {
  aether: {
    imageUrl: '/products/aether.webp',
    hoverImageUrl: '/products/aether_box.webp',
    editorialTallImageUrl: '/products/aether_dark.webp',
    editorialWideImageUrl: '/products/aether_slate.webp',
  },
  aria: {
    imageUrl: '/products/aria.webp',
    hoverImageUrl: '/products/aria_box.webp',
    editorialTallImageUrl: '/products/aria_hands.webp',
    editorialWideImageUrl: '/products/aria_citrus.webp',
  },
  oudor: {
    imageUrl: '/products/oudor.webp',
    hoverImageUrl: '/products/oudor_box.webp',
    editorialTallImageUrl: '/products/oudor_wood.webp',
    editorialWideImageUrl: '/products/oudor_rocks.webp',
  },
};

(async () => {
  for (const [slug, data] of Object.entries(UPDATES)) {
    const updated = await prisma.product.updateMany({ where: { slug }, data });
    console.log(slug, updated.count ? 'updated' : 'not found');
  }
  await prisma.$disconnect();
})();
