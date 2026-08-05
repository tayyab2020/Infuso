const express = require('express');
const prisma = require('../db');

const router = express.Router();

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Public: approved reviews for one product, plus the aggregate rating shown
// next to the product name.
router.get('/product/:productId', async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { productId: req.params.productId, approved: true },
    select: { id: true, customerName: true, rating: true, comment: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : null;
  res.json({ average, count, reviews });
});

// Public: latest approved reviews across every product, for the homepage's
// reviews section. A multi-product admin submission creates one row per
// product sharing a batchId — those are collapsed into a single card here
// (with every included product name listed) instead of showing as
// duplicate cards with identical text.
router.get('/latest', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 24);
  const reviews = await prisma.review.findMany({
    where: { approved: true },
    select: {
      id: true, batchId: true, customerName: true, rating: true, comment: true, createdAt: true,
      product: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const groups = [];
  const groupByBatchId = new Map();
  for (const r of reviews) {
    if (r.batchId && groupByBatchId.has(r.batchId)) {
      groupByBatchId.get(r.batchId).products.push({ name: r.product.name, slug: r.product.slug });
      continue;
    }
    const group = { id: r.id, customerName: r.customerName, rating: r.rating, comment: r.comment, createdAt: r.createdAt, products: [{ name: r.product.name, slug: r.product.slug }] };
    groups.push(group);
    if (r.batchId) groupByBatchId.set(r.batchId, group);
  }

  res.json(groups.slice(0, limit).map((g) => ({
    id: g.id, customerName: g.customerName, rating: g.rating, comment: g.comment, createdAt: g.createdAt,
    productName: g.products.map((p) => p.name).join(', '), productSlug: g.products[0].slug,
  })));
});

// Public: submit a review. Requires a real order number that actually
// contains this product — this is what stands in for identity verification
// on a storefront with no customer accounts. Goes into the moderation queue
// (approved: false) rather than appearing immediately.
router.post('/', async (req, res) => {
  const { productId, orderNumber, customerName, rating, comment } = req.body || {};

  if (!isNonEmptyString(productId)) return res.status(400).json({ error: 'productId is required.' });
  if (!isNonEmptyString(orderNumber)) return res.status(400).json({ error: 'Please enter your order number.' });
  if (!isNonEmptyString(customerName)) return res.status(400).json({ error: 'Please enter your name.' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be an integer between 1 and 5.' });
  }
  if (!isNonEmptyString(comment)) return res.status(400).json({ error: 'Please write a short review.' });

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.trim().toUpperCase() },
    include: { items: true },
  });
  if (!order) return res.status(400).json({ error: "We couldn't find that order number." });
  if (!order.items.some((it) => it.productId === productId)) {
    return res.status(400).json({ error: "That order doesn't include this product." });
  }

  const review = await prisma.review.create({
    data: {
      productId,
      orderNumber: order.orderNumber,
      customerName: customerName.trim(),
      rating,
      comment: comment.trim(),
    },
  });
  res.status(201).json({ id: review.id, message: "Thanks — your review will appear once it's been reviewed." });
});

module.exports = router;
