const express = require('express');
const prisma = require('../db');
const { sendMail } = require('../mailer');
const { newsletterWelcomeEmail, newsletterAdminNotifyEmail } = require('../orderEmails');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const settings = (await prisma.siteSettings.findUnique({ where: { id: 'singleton' } })) || {};
  const from = settings.mailFromName || settings.mailFromAddress
    ? `"${settings.mailFromName || 'INFUSO'}" <${settings.mailFromAddress || 'sales@infuso.pk'}>`
    : undefined;

  let isNew = true;
  try {
    await prisma.subscriber.create({ data: { email } });
  } catch (err) {
    if (err.code === 'P2002') {
      isNew = false;
    } else {
      throw err;
    }
  }

  res.json({ ok: true });

  // Only email out on a genuinely new signup — resubmitting an already
  // subscribed address shouldn't re-send the welcome email or re-notify admin.
  if (isNew) {
    sendMail({ to: email, from, ...newsletterWelcomeEmail() });
    const adminNotifyTo = process.env.ADMIN_NOTIFY_EMAIL || settings.contactEmail || 'sales@infuso.pk';
    sendMail({ to: adminNotifyTo, from, ...newsletterAdminNotifyEmail(email) });
  }
});

module.exports = router;
