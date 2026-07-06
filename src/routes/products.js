const express = require('express');
const prisma = require('../db');

const router = express.Router();

// Public: list active products. Price/stock are always authoritative from the
// DB; content/image fields are optional overrides — the storefront merges
// them in by slug and falls back to its own hardcoded copy when a field is
// null (e.g. before an admin has customized that product).
router.get('/', async (req, res) => {
  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      slug: true, name: true, price: true, priceOld: true, stock: true,
      imageUrl: true, hoverImageUrl: true, editorialTallImageUrl: true, editorialWideImageUrl: true,
      tagline: true, topNote: true, heartNote: true, baseNote: true, description: true,
      inspiredBy: true, editorialLine: true, editorialStory: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(products);
});

module.exports = router;
