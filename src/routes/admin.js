const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const upload = require('../middleware/upload');
const { sendMail } = require('../mailer');
const { orderStatusEmail, codConfirmationEmail, bankTransferEmail } = require('../orderEmails');
const { normalizeCode } = require('../lib/voucher');
const { generateOrderNumber } = require('../lib/orderNumber');

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'PAYMENT_RECEIVED', 'CANCELLED'];
const DEFAULT_DELIVERY_CHARGE = 280;

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

// Optional date field from a <input type="date"> value ('YYYY-MM-DD') or ISO
// string. Returns undefined (leave unchanged), null (clear it), a Date, or
// the sentinel NaN for an unparseable value so callers can reject it.
function optionalDate(v, endOfDay) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T23:59:59.999' : v);
  return isNaN(d.getTime()) ? NaN : d;
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

// Admin-created order — e.g. one taken over WhatsApp/phone. Unlike the public
// checkout endpoint, customerEmail and phone are optional (a phone order may
// only have one of the two) and the admin picks the initial status directly
// instead of it always starting at PENDING. Stock is still decremented like a
// real sale, but no Meta Conversions event is sent (this never happened on
// the storefront, so it isn't a real ad-attributable conversion) and a
// confirmation email only goes out if an email address was actually given.
router.post('/orders', requireAdmin, async (req, res) => {
  const { customerName, customerEmail, phone, address, city, notes, items, paymentMethod, status } = req.body || {};

  if (!isNonEmptyString(customerName) || !isNonEmptyString(address) || !isNonEmptyString(city)) {
    return res.status(400).json({ error: 'customerName, address, and city are required.' });
  }
  if (isNonEmptyString(customerEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
    return res.status(400).json({ error: 'customerEmail must be a valid email address.' });
  }
  if (paymentMethod !== undefined && paymentMethod !== 'COD' && paymentMethod !== 'BANK_TRANSFER') {
    return res.status(400).json({ error: 'paymentMethod must be COD or BANK_TRANSFER.' });
  }
  if (status !== undefined && !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array of { slug, quantity }.' });
  }
  for (const it of items) {
    if (!isNonEmptyString(it && it.slug) || !Number.isInteger(it.quantity) || it.quantity < 1) {
      return res.status(400).json({ error: 'Each item needs a valid slug and a positive integer quantity.' });
    }
  }

  try {
    const settings = (await prisma.siteSettings.findUnique({ where: { id: 'singleton' } })) || {};
    const deliveryCharge = Number.isInteger(settings.deliveryCharge) ? settings.deliveryCharge : DEFAULT_DELIVERY_CHARGE;

    let order;
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt++) {
      try {
        order = await prisma.$transaction(async (tx) => {
          let totalAmount = 0;
          const itemsData = [];

          for (const it of items) {
            const product = await tx.product.findUnique({ where: { slug: it.slug } });
            if (!product) throw Object.assign(new Error(`Unknown product: ${it.slug}`), { status: 400 });
            if (product.stock < it.quantity) {
              throw Object.assign(new Error(`Not enough stock for ${product.name}.`), { status: 409 });
            }
            const { count } = await tx.product.updateMany({
              where: { id: product.id, stock: { gte: it.quantity } },
              data: { stock: { decrement: it.quantity } },
            });
            if (count === 0) {
              throw Object.assign(new Error(`Not enough stock for ${product.name}.`), { status: 409 });
            }
            totalAmount += product.price * it.quantity;
            itemsData.push({
              productId: product.id,
              productName: product.name,
              quantity: it.quantity,
              unitPrice: product.price,
            });
          }

          return tx.order.create({
            data: {
              orderNumber: generateOrderNumber(),
              customerName: customerName.trim(),
              customerEmail: isNonEmptyString(customerEmail) ? customerEmail.trim() : '',
              phone: isNonEmptyString(phone) ? phone.trim() : '',
              address: address.trim(),
              city: city.trim(),
              notes: isNonEmptyString(notes) ? notes.trim() : null,
              status: status || 'PENDING',
              paymentMethod: paymentMethod === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'COD',
              deliveryCharge,
              totalAmount: totalAmount + deliveryCharge,
              items: { create: itemsData },
            },
            include: { items: true },
          });
        });
        break;
      } catch (err) {
        const isOrderNumberClash = err.code === 'P2002' && err.meta && err.meta.target && err.meta.target.includes('orderNumber');
        if (isOrderNumberClash && attempt < MAX_ATTEMPTS) continue;
        throw err;
      }
    }

    res.status(201).json(order);

    if (isNonEmptyString(order.customerEmail)) {
      const email = order.paymentMethod === 'BANK_TRANSFER' ? bankTransferEmail(order, settings) : codConfirmationEmail(order, settings);
      const from = settings.mailFromName || settings.mailFromAddress
        ? `"${settings.mailFromName || 'INFUSO'}" <${settings.mailFromAddress || 'sales@infuso.pk'}>`
        : undefined;
      sendMail({ to: order.customerEmail, from, ...email });
    }
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || 'Failed to create order.' });
  }
});

router.patch('/orders/:id', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
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
  'concentration', 'longevity', 'howToUse', 'ingredients',
];
const PRODUCT_IMAGE_FIELDS = [
  'imageUrl', 'hoverImageUrl', 'editorialTallImageUrl', 'editorialWideImageUrl',
];
const PRODUCT_CATEGORIES = ['MEN', 'WOMEN', 'UNISEX'];
// featuredImage names which of PRODUCT_IMAGE_FIELDS is the default image shown
// on the storefront product page.
const FEATURED_IMAGE_VALUES = PRODUCT_IMAGE_FIELDS;

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
  if (req.body.featuredImage !== undefined && !FEATURED_IMAGE_VALUES.includes(req.body.featuredImage)) {
    return res.status(400).json({ error: `featuredImage must be one of: ${FEATURED_IMAGE_VALUES.join(', ')}` });
  }

  const data = {
    slug: slug.trim(),
    name: name.trim(),
    price,
    priceOld: priceOld === null || priceOld === undefined ? null : priceOld,
    stock: Number.isInteger(stock) && stock >= 0 ? stock : 0,
    active: active !== false,
    category: category || 'UNISEX',
    featuredImage: req.body.featuredImage || 'imageUrl',
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
  if (req.body.featuredImage !== undefined) {
    if (!FEATURED_IMAGE_VALUES.includes(req.body.featuredImage)) {
      return res.status(400).json({ error: `featuredImage must be one of: ${FEATURED_IMAGE_VALUES.join(', ')}` });
    }
    data.featuredImage = req.body.featuredImage;
  }

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
  'deliveryInfo', 'returnPolicy',
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

// ---- Vouchers ----

router.get('/vouchers', requireAdmin, async (req, res) => {
  const vouchers = await prisma.voucher.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(vouchers);
});

router.post('/vouchers', requireAdmin, async (req, res) => {
  const { code, discountPercent, active, startsAt, expiresAt } = req.body || {};
  if (!isNonEmptyString(code)) return res.status(400).json({ error: 'code is required.' });
  if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) {
    return res.status(400).json({ error: 'discountPercent must be an integer between 1 and 100.' });
  }
  const startsAtDate = optionalDate(startsAt);
  const expiresAtDate = optionalDate(expiresAt, true);
  if (Number.isNaN(startsAtDate) || Number.isNaN(expiresAtDate)) {
    return res.status(400).json({ error: 'startsAt/expiresAt must be valid dates.' });
  }

  try {
    const voucher = await prisma.voucher.create({
      data: {
        code: normalizeCode(code),
        discountPercent,
        active: active !== false,
        startsAt: startsAtDate || null,
        expiresAt: expiresAtDate || null,
      },
    });
    res.status(201).json(voucher);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A voucher with that code already exists.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create voucher.' });
  }
});

router.put('/vouchers/:id', requireAdmin, async (req, res) => {
  const { code, discountPercent, active, startsAt, expiresAt } = req.body || {};
  const data = {};
  if (code !== undefined) {
    if (!isNonEmptyString(code)) return res.status(400).json({ error: 'code must be a non-empty string.' });
    data.code = normalizeCode(code);
  }
  if (discountPercent !== undefined) {
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) {
      return res.status(400).json({ error: 'discountPercent must be an integer between 1 and 100.' });
    }
    data.discountPercent = discountPercent;
  }
  if (active !== undefined) data.active = !!active;
  if (startsAt !== undefined) {
    const d = optionalDate(startsAt);
    if (Number.isNaN(d)) return res.status(400).json({ error: 'startsAt must be a valid date.' });
    data.startsAt = d;
  }
  if (expiresAt !== undefined) {
    const d = optionalDate(expiresAt, true);
    if (Number.isNaN(d)) return res.status(400).json({ error: 'expiresAt must be a valid date.' });
    data.expiresAt = d;
  }

  try {
    const voucher = await prisma.voucher.update({ where: { id: req.params.id }, data });
    res.json(voucher);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A voucher with that code already exists.' });
    res.status(404).json({ error: 'Voucher not found.' });
  }
});

router.delete('/vouchers/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.voucher.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: 'Voucher not found.' });
  }
});

// ---- Reviews ----

router.get('/reviews', requireAdmin, async (req, res) => {
  const reviews = await prisma.review.findMany({
    include: { product: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(reviews);
});

// Admin-authored review (e.g. imported from social media/WhatsApp) — unlike
// the public submission endpoint, this doesn't require a matching order and
// is approved (publicly visible) by default. A single order can include
// several products, so this accepts a list of { productId, quantity } items
// and creates one review row per item — same customer/rating/comment/order#
// on each — so the review shows up correctly on every product's own page.
router.post('/reviews', requireAdmin, async (req, res) => {
  const { items, orderNumber, customerName, rating, comment, approved } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array of { productId, quantity }.' });
  }
  for (const item of items) {
    if (!isNonEmptyString(item && item.productId)) {
      return res.status(400).json({ error: 'Each item requires a productId.' });
    }
    if (item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 1)) {
      return res.status(400).json({ error: 'quantity must be a positive integer.' });
    }
  }
  if (!isNonEmptyString(customerName)) return res.status(400).json({ error: 'customerName is required.' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be an integer between 1 and 5.' });
  }
  if (!isNonEmptyString(comment)) return res.status(400).json({ error: 'comment is required.' });

  // Multiple products in one submission share a batchId so the homepage's
  // cross-product feed can render them as a single card; a lone product
  // needs no grouping.
  const batchId = items.length > 1 ? crypto.randomUUID() : null;

  try {
    const reviews = await prisma.$transaction(items.map((item) => prisma.review.create({
      data: {
        productId: item.productId,
        quantity: Number.isInteger(item.quantity) ? item.quantity : 1,
        batchId,
        orderNumber: isNonEmptyString(orderNumber) ? orderNumber.trim().toUpperCase() : null,
        customerName: customerName.trim(),
        rating,
        comment: comment.trim(),
        approved: approved !== false,
      },
      include: { product: { select: { name: true, slug: true } } },
    })));
    res.status(201).json(reviews);
  } catch (err) {
    if (err.code === 'P2003') return res.status(400).json({ error: 'Unknown product.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create review.' });
  }
});

router.patch('/reviews/:id', requireAdmin, async (req, res) => {
  const { productId, orderNumber, customerName, rating, comment, quantity, approved } = req.body || {};
  const data = {};
  if (productId !== undefined) {
    if (!isNonEmptyString(productId)) return res.status(400).json({ error: 'productId must be a non-empty string.' });
    data.productId = productId;
  }
  if (orderNumber !== undefined) {
    data.orderNumber = isNonEmptyString(orderNumber) ? orderNumber.trim().toUpperCase() : null;
  }
  if (customerName !== undefined) {
    if (!isNonEmptyString(customerName)) return res.status(400).json({ error: 'customerName must be a non-empty string.' });
    data.customerName = customerName.trim();
  }
  if (rating !== undefined) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be an integer between 1 and 5.' });
    }
    data.rating = rating;
  }
  if (comment !== undefined) {
    if (!isNonEmptyString(comment)) return res.status(400).json({ error: 'comment must be a non-empty string.' });
    data.comment = comment.trim();
  }
  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'quantity must be a positive integer.' });
    data.quantity = quantity;
  }
  if (approved !== undefined) data.approved = !!approved;

  try {
    const review = await prisma.review.update({
      where: { id: req.params.id },
      data,
      include: { product: { select: { name: true, slug: true } } },
    });
    res.json(review);
  } catch (err) {
    if (err.code === 'P2003') return res.status(400).json({ error: 'Unknown product.' });
    res.status(404).json({ error: 'Review not found.' });
  }
});

router.delete('/reviews/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.review.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: 'Review not found.' });
  }
});

module.exports = router;
