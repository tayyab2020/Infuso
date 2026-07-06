const express = require('express');
const prisma = require('../db');
const { sendMail } = require('../mailer');
const { codConfirmationEmail, bankTransferEmail, adminNotificationEmail } = require('../orderEmails');
const { generateOrderNumber } = require('../lib/orderNumber');

const router = express.Router();

const DEFAULT_DELIVERY_CHARGE = 280;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidEmail(v) {
  return isNonEmptyString(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// Public: place an order. Body: { customerName, customerEmail, phone, address,
// city, notes?, items: [{ slug, quantity }] }. Price/stock are always resolved
// server-side — the client never gets to dictate what it pays.
router.post('/', async (req, res) => {
  const { customerName, customerEmail, phone, address, city, notes, items, paymentMethod } = req.body || {};

  if (!isNonEmptyString(customerName) || !isValidEmail(customerEmail) || !isNonEmptyString(phone) ||
      !isNonEmptyString(address) || !isNonEmptyString(city)) {
    return res.status(400).json({ error: 'customerName, a valid customerEmail, phone, address, and city are required.' });
  }
  if (paymentMethod !== undefined && paymentMethod !== 'COD' && paymentMethod !== 'BANK_TRANSFER') {
    return res.status(400).json({ error: 'paymentMethod must be COD or BANK_TRANSFER.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty.' });
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
            if (!product || !product.active) {
              throw Object.assign(new Error(`Product "${it.slug}" is not available.`), { status: 400 });
            }
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
              customerEmail: customerEmail.trim(),
              phone: phone.trim(),
              address: address.trim(),
              city: city.trim(),
              notes: isNonEmptyString(notes) ? notes.trim() : null,
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

    const email = order.paymentMethod === 'BANK_TRANSFER' ? bankTransferEmail(order, settings) : codConfirmationEmail(order, settings);
    const from = settings.mailFromName || settings.mailFromAddress
      ? `"${settings.mailFromName || 'INFUSO'}" <${settings.mailFromAddress || 'sales@infuso.pk'}>`
      : undefined;
    sendMail({ to: order.customerEmail, from, ...email });

    const adminNotifyTo = settings.contactEmail || process.env.ADMIN_NOTIFY_EMAIL || 'sales@infuso.pk';
    sendMail({ to: adminNotifyTo, from, ...adminNotificationEmail(order) });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || 'Failed to place order.' });
  }
});

module.exports = router;
