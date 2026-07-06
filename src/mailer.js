const nodemailer = require('nodemailer');

const MAIL_FROM = process.env.MAIL_FROM || '"INFUSO" <sales@infuso.pk>';

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
} else {
  console.warn('[mailer] SMTP_HOST not set — order emails will be logged instead of sent. See .env.example.');
}

// Never lets a mail failure break order placement — callers just fire-and-forget.
async function sendMail({ to, from, subject, html, attachments }) {
  if (!transporter) {
    console.log(`[mailer] (SMTP not configured) would send "${subject}" to ${to}`);
    return;
  }
  try {
    await transporter.sendMail({ from: from || MAIL_FROM, to, subject, html, attachments });
    console.log(`[mailer] sent "${subject}" to ${to}`);
  } catch (err) {
    console.error('[mailer] failed to send email:', err.message);
  }
}

module.exports = { sendMail };
