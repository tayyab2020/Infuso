const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const upload = require('../middleware/upload');
const { sendMail } = require('../mailer');
const { orderStatusEmail } = require('../orderEmails');

const router = express.Router();

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Optional text field: '' -> null (falls back to storefront's hardcoded copy), string -> trimmed.
function optionalText(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

// ---- Auth ----

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) return res.status(401).json({ error: 'Invalid email or password.' });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

  req.session.adminId = admin.id;
  res.json({ email: admin.email });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAdmin, async (req, res) => {
  const admin = await prisma.adminUser.findUnique({ where: { id: req.session.adminId } });
  if (!admin) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ email: admin.email });
});

// ---- Uploads ----

router.post('/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid image file uploaded (png/jpg/webp, max 5MB).' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ---- Orders ----

router.get('/orders', requireAdmin, async (req, res) => {
  const orders = await prisma.order.findMany({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
});

router.patch('/orders/:id', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  const validStatuses = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'PAYMENT_RECEIVED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status },
      include: { items: true },
    });
    res.json(order);

    const settings = (await prisma.siteSettings.findUnique({ where: { id: 'singleton' } })) || {};
    const from = settings.mailFromName || settings.mailFromAddress
      ? `"${settings.mailFromName || 'INFUSO'}" <${settings.mailFromAddress || 'sales@infuso.pk'}>`
      : undefined;
    sendMail({ to: order.customerEmail, from, ...orderStatusEmail(order, status, settings) });
  } catch (err) {
    res.status(404).json({ error: 'Order not found.' });
  }
});

// Replaces an order's line items wholesale (admin correction tool — wrong size
// picked, customer asked to swap a product, etc). Prices are re-priced from
// each product's current price, and totalAmount is recomputed on top of the
// order's existing deliveryCharge.
router.put('/orders/:id/items', requireAdmin, async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items must be a non-empty array.' });
  }
  const normalized = [];
  for (const it of items) {
    const slug = it && it.slug;
    const quantity = Number(it && it.quantity);
    if (typeof slug !== 'string' || !slug.trim() || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Each item needs a valid slug and an integer quantity >= 1.' });
    }
    normalized.push({ slug, quantity });
  }

  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const products = await prisma.product.findMany({ where: { slug: { in: normalized.map((n) => n.slug) } } });
  const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  for (const n of normalized) {
    if (!bySlug[n.slug]) return res.status(400).json({ error: `Unknown product: ${n.slug}` });
  }

  // Stock follows the order: taking more of a product than it previously held
  // draws down stock (like a fresh checkout would); taking less restocks the
  // difference. Only products whose quantity actually changed are touched.
  const oldQtyByProductId = {};
  for (const it of order.items) oldQtyByProductId[it.productId] = (oldQtyByProductId[it.productId] || 0) + it.quantity;
  const newQtyByProductId = {};
  for (const n of normalized) {
    const productId = bySlug[n.slug].id;
    newQtyByProductId[productId] = (newQtyByProductId[productId] || 0) + n.quantity;
  }
  const allProductIds = new Set([...Object.keys(oldQtyByProductId), ...Object.keys(newQtyByProductId)]);
  const stockDeltas = [...allProductIds]
    .map((productId) => ({ productId, delta: (newQtyByProductId[productId] || 0) - (oldQtyByProductId[productId] || 0) }))
    .filter((d) => d.delta !== 0);

  const itemsTotal = normalized.reduce((sum, n) => sum + bySlug[n.slug].price * n.quantity, 0);
  const totalAmount = itemsTotal + (order.deliveryCharge || 0);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      for (const { productId, delta } of stockDeltas) {
        if (delta > 0) {
          const { count } = await tx.product.updateMany({
            where: { id: productId, stock: { gte: delta } },
            data: { stock: { decrement: delta } },
          });
          if (count === 0) {
            const p = await tx.product.findUnique({ where: { id: productId } });
            throw Object.assign(new Error(`Not enough stock for ${p ? p.name : 'product'}.`), { status: 409 });
          }
        } else {
          await tx.product.update({ where: { id: productId }, data: { stock: { increment: -delta } } });
        }
      }

      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      return tx.order.update({
        where: { id: order.id },
        data: {
          totalAmount,
          items: {
            create: normalized.map((n) => ({
              productId: bySlug[n.slug].id,
              quantity: n.quantity,
              unitPrice: bySlug[n.slug].price,
              productName: bySlug[n.slug].name,
            })),
          },
        },
        include: { items: true },
      });
    });

    res.json(updated);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.delete('/orders/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.order.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: 'Order not found.' });
  }
});

// ---- Products ----

// Fields beyond the original slug/name/price/stock/active — all optional content/image fields.
const PRODUCT_TEXT_FIELDS = [
  'tagline', 'topNote', 'heartNote', 'baseNote', 'description', 'inspiredBy',
  'editorialLine', 'editorialStory',
];
const PRODUCT_IMAGE_FIELDS = [
  'imageUrl', 'hoverImageUrl', 'editorialTallImageUrl', 'editorialWideImageUrl',
];
const PRODUCT_CATEGORIES = ['MEN', 'WOMEN', 'UNISEX'];

router.get('/products', requireAdmin, async (req, res) => {
  const products = await prisma.product.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(products);
});

router.post('/products', requireAdmin, async (req, res) => {
  const { slug, name, price, priceOld, stock, active, category } = req.body || {};
  if (typeof slug !== 'string' || !slug.trim() || typeof name !== 'string' || !name.trim() ||
      !Number.isInteger(price) || price < 0) {
    return res.status(400).json({ error: 'slug, name, and a non-negative integer price are required.' });
  }
  if (priceOld !== undefined && priceOld !== null && (!Number.isInteger(priceOld) || priceOld < 0)) {
    return res.status(400).json({ error: 'priceOld must be a non-negative integer or null.' });
  }
  if (category !== undefined && !PRODUCT_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${PRODUCT_CATEGORIES.join(', ')}` });
  }

  const data = {
    slug: slug.trim(),
    name: name.trim(),
    price,
    priceOld: priceOld === null || priceOld === undefined ? null : priceOld,
    stock: Number.isInteger(stock) && stock >= 0 ? stock : 0,
    active: active !== false,
    category: category || 'UNISEX',
  };
  for (const key of PRODUCT_TEXT_FIELDS) {
    const v = optionalText(req.body[key]);
    if (v !== undefined) data[key] = v;
  }
  for (const key of PRODUCT_IMAGE_FIELDS) {
    const v = optionalText(req.body[key]);
    if (v !== undefined) data[key] = v;
  }

  try {
    const product = await prisma.product.create({ data });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A product with that slug already exists.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

router.put('/products/:id', requireAdmin, async (req, res) => {
  const { name, price, priceOld, stock, active, category } = req.body || {};
  const data = {};
  if (category !== undefined) {
    if (!PRODUCT_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${PRODUCT_CATEGORIES.join(', ')}` });
    }
    data.category = category;
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name must be a non-empty string.' });
    data.name = name.trim();
  }
  if (price !== undefined) {
    if (!Number.isInteger(price) || price < 0) return res.status(400).json({ error: 'price must be a non-negative integer.' });
    data.price = price;
  }
  if (priceOld !== undefined) {
    if (priceOld !== null && (!Number.isInteger(priceOld) || priceOld < 0)) {
      return res.status(400).json({ error: 'priceOld must be a non-negative integer or null.' });
    }
    data.priceOld = priceOld;
  }
  if (stock !== undefined) {
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'stock must be a non-negative integer.' });
    data.stock = stock;
  }
  if (active !== undefined) data.active = !!active;

  for (const key of [...PRODUCT_TEXT_FIELDS, ...PRODUCT_IMAGE_FIELDS]) {
    const v = optionalText(req.body[key]);
    if (v !== undefined) data[key] = v;
  }

  try {
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    res.json(product);
  } catch (err) {
    res.status(404).json({ error: 'Product not found.' });
  }
});

router.delete('/products/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(409).json({ error: 'This product has existing orders — set it inactive instead of deleting it.' });
    }
    res.status(404).json({ error: 'Product not found.' });
  }
});

// ---- FAQs ----

router.get('/faqs', requireAdmin, async (req, res) => {
  const faqs = await prisma.faq.findMany({ orderBy: { order: 'asc' } });
  res.json(faqs);
});

router.post('/faqs', requireAdmin, async (req, res) => {
  const { question, answer, order, active } = req.body || {};
  if (!isNonEmptyString(question) || !isNonEmptyString(answer)) {
    return res.status(400).json({ error: 'question and answer are required.' });
  }
  const faq = await prisma.faq.create({
    data: {
      question: question.trim(),
      answer: answer.trim(),
      order: Number.isInteger(order) ? order : 0,
      active: active !== false,
    },
  });
  res.status(201).json(faq);
});

router.put('/faqs/:id', requireAdmin, async (req, res) => {
  const { question, answer, order, active } = req.body || {};
  const data = {};
  if (question !== undefined) {
    if (!isNonEmptyString(question)) return res.status(400).json({ error: 'question must be a non-empty string.' });
    data.question = question.trim();
  }
  if (answer !== undefined) {
    if (!isNonEmptyString(answer)) return res.status(400).json({ error: 'answer must be a non-empty string.' });
    data.answer = answer.trim();
  }
  if (order !== undefined) {
    if (!Number.isInteger(order)) return res.status(400).json({ error: 'order must be an integer.' });
    data.order = order;
  }
  if (active !== undefined) data.active = !!active;

  try {
    const faq = await prisma.faq.update({ where: { id: req.params.id }, data });
    res.json(faq);
  } catch (err) {
    res.status(404).json({ error: 'FAQ not found.' });
  }
});

router.delete('/faqs/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.faq.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: 'FAQ not found.' });
  }
});

// ---- Settings ----

const SETTINGS_FIELDS = [
  'logoUrl', 'facebookUrl', 'instagramUrl', 'contactEmail', 'whatsappNumber',
  'bankAccountName', 'bankName', 'bankAccountNumber', 'bankIban', 'bankQrImageUrl',
  'mailFromName', 'mailFromAddress', 'codEmailSubject', 'codEmailIntro',
  'bankEmailSubject', 'bankEmailIntro',
  'houseEyebrow', 'houseBody',
  'editorialEyebrow', 'editorialHeading', 'editorialBody',
  'discoveryEyebrow', 'discoveryHeading', 'discoveryBody',
  'faqEyebrow', 'faqHeading', 'footerCopyright',
];

router.get('/settings', requireAdmin, async (req, res) => {
  const settings = await prisma.siteSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  res.json(settings);
});

router.put('/settings', requireAdmin, async (req, res) => {
  const data = {};
  for (const key of SETTINGS_FIELDS) {
    const v = optionalText(req.body[key]);
    if (v !== undefined) data[key] = v;
  }
  if (req.body.deliveryCharge !== undefined) {
    const dc = req.body.deliveryCharge;
    if (dc !== null && dc !== '' && (!Number.isInteger(dc) || dc < 0)) {
      return res.status(400).json({ error: 'deliveryCharge must be a non-negative integer.' });
    }
    data.deliveryCharge = dc === null || dc === '' ? null : dc;
  }
  const settings = await prisma.siteSettings.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });
  res.json(settings);
});

// ---- Newsletter subscribers ----

router.get('/subscribers', requireAdmin, async (req, res) => {
  const subscribers = await prisma.subscriber.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(subscribers);
});

router.delete('/subscribers/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.subscriber.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: 'Subscriber not found.' });
  }
});

module.exports = router;
