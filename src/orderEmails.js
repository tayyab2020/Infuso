const fs = require('fs');
const path = require('path');

const PKR = (n) => 'PKR ' + n.toLocaleString('en-PK');
const DEFAULT_QR_PATH = path.join(__dirname, '..', 'public', 'products', 'bank-qr.png');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Admin-edited intro text may contain a {{customerName}} token — substituted
// after escaping the template, so the token itself (and the customer's name)
// can never inject markup.
function renderIntro(template, order) {
  return escapeHtml(template)
    .replace(/\{\{\s*customerName\s*\}\}/g, escapeHtml(order.customerName))
    .replace(/\n/g, '<br>');
}

function itemsRows(order) {
  return order.items
    .map((it) => `<tr>
      <td style="padding:6px 0; color:rgba(230,226,218,0.85);">${it.quantity} × ${escapeHtml(it.productName)}</td>
      <td style="padding:6px 0; text-align:right; color:rgba(230,226,218,0.85);">${PKR(it.unitPrice * it.quantity)}</td>
    </tr>`)
    .join('');
}

function deliveryRow(order) {
  if (!order.deliveryCharge) return '';
  return `<tr>
    <td style="padding:6px 0; color:rgba(230,226,218,0.85);">Delivery Charges</td>
    <td style="padding:6px 0; text-align:right; color:rgba(230,226,218,0.85);">${PKR(order.deliveryCharge)}</td>
  </tr>`;
}

function wrapper(bodyHtml) {
  return `<div style="font-family:Georgia,'Cormorant Garamond',serif; background:#f4f2ee; padding:32px 16px;">
    <div style="max-width:520px; margin:0 auto; background:#0d1013; color:#f0ebe2; border-radius:10px; overflow:hidden;">
      <div style="padding:28px 32px; border-bottom:1px solid rgba(240,235,226,0.12);">
        <div style="font-family:Arial,sans-serif; font-size:13px; letter-spacing:0.3em;">INFUSO</div>
      </div>
      <div style="padding:28px 32px; font-family:Arial,sans-serif;">${bodyHtml}</div>
      <div style="padding:18px 32px; border-top:1px solid rgba(240,235,226,0.12); font-family:Arial,sans-serif; font-size:11px; color:rgba(240,235,226,0.4);">© INFUSO — sales@infuso.pk</div>
    </div>
  </div>`;
}

function codConfirmationEmail(order, settings = {}) {
  const subject = settings.codEmailSubject || 'Your INFUSO order has been received';
  const intro = settings.codEmailIntro
    ? renderIntro(settings.codEmailIntro, order)
    : `Hi ${escapeHtml(order.customerName)}, thank you for your order. We've received it and will confirm it shortly — it'll be paid for by <strong>Cash on Delivery</strong> when it arrives.`;
  const html = wrapper(`
    <h2 style="margin:0 0 12px; font-family:Georgia,serif; font-weight:400; color:#f0ebe2;">Order #${order.orderNumber} received</h2>
    <p style="font-size:14px; line-height:1.7; color:rgba(240,235,226,0.75);">${intro}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:18px; font-size:13px;">
      ${itemsRows(order)}
      ${deliveryRow(order)}
      <tr><td style="padding-top:12px; border-top:1px solid rgba(240,235,226,0.15); font-weight:bold; color:#f0ebe2;">Total</td>
          <td style="padding-top:12px; border-top:1px solid rgba(240,235,226,0.15); text-align:right; font-weight:bold; color:#f0ebe2;">${PKR(order.totalAmount)}</td></tr>
    </table>
    <p style="margin-top:20px; font-size:13px; line-height:1.7; color:rgba(240,235,226,0.6);">Delivering to: ${escapeHtml(order.address)}, ${escapeHtml(order.city)}<br>We'll be in touch at ${escapeHtml(order.phone)} to confirm delivery.</p>
  `);
  return { subject, html, attachments: [] };
}

function bankTransferEmail(order, settings = {}) {
  const qrPath = settings.bankQrImageUrl
    ? path.join(__dirname, '..', 'public', settings.bankQrImageUrl.replace(/^\//, ''))
    : DEFAULT_QR_PATH;
  const hasQr = fs.existsSync(qrPath);

  const subject = settings.bankEmailSubject || 'Complete your INFUSO payment — bank transfer details';
  const intro = settings.bankEmailIntro
    ? renderIntro(settings.bankEmailIntro, order)
    : `Hi ${escapeHtml(order.customerName)}, thank you for your order. Please complete payment via bank transfer using the details below.`;

  const bankAccountName = settings.bankAccountName || 'Minahil Asim';
  const bankName = settings.bankName || 'Bank Al Habib';
  const bankAccountNumber = settings.bankAccountNumber || '5648-1829-000802-01-2';
  const bankIban = settings.bankIban || 'PK24BAHL5648182900080201';
  const whatsappNumber = settings.whatsappNumber || '923316841320';
  const whatsappDisplay = '+' + whatsappNumber.replace(/(\d{2})(\d{3})(\d{7})/, '$1 $2 $3');

  const html = wrapper(`
    <h2 style="margin:0 0 12px; font-family:Georgia,serif; font-weight:400; color:#f0ebe2;">Order #${order.orderNumber} received — awaiting payment</h2>
    <p style="font-size:14px; line-height:1.7; color:rgba(240,235,226,0.75);">${intro}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:18px; font-size:13px;">
      ${itemsRows(order)}
      ${deliveryRow(order)}
      <tr><td style="padding-top:12px; border-top:1px solid rgba(240,235,226,0.15); font-weight:bold; color:#f0ebe2;">Total</td>
          <td style="padding-top:12px; border-top:1px solid rgba(240,235,226,0.15); text-align:right; font-weight:bold; color:#f0ebe2;">${PKR(order.totalAmount)}</td></tr>
    </table>
    ${hasQr ? '<div style="text-align:center; margin-top:22px;"><img src="cid:bank-qr" alt="Bank transfer payment QR" style="width:170px; height:170px; background:#fff; padding:8px; border-radius:8px;" /></div>' : ''}
    <div style="margin-top:20px; background:rgba(255,255,255,0.04); border:1px solid rgba(240,235,226,0.12); border-radius:8px; padding:16px; font-size:13px; line-height:1.9; color:rgba(230,226,218,0.85);">
      <div style="color:#f0ebe2; font-weight:bold;">${escapeHtml(bankAccountName)}</div>
      <div>${escapeHtml(bankName)}</div>
      <div>Account No: ${escapeHtml(bankAccountNumber)}</div>
      <div>IBAN: ${escapeHtml(bankIban)}</div>
    </div>
    <p style="margin-top:20px; font-size:13px; line-height:1.7; color:rgba(150,220,235,0.9);">After paying, please share your transaction screenshot on WhatsApp <strong>${escapeHtml(whatsappDisplay)}</strong> so we can confirm your order. You'll be notified once it's confirmed.</p>
  `);
  return {
    subject,
    html,
    attachments: hasQr ? [{ filename: 'bank-qr.png', path: qrPath, cid: 'bank-qr' }] : [],
  };
}

function adminNotificationEmail(order) {
  const paymentLabel = order.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : 'Cash on Delivery';
  const html = wrapper(`
    <h2 style="margin:0 0 12px; font-family:Georgia,serif; font-weight:400; color:#f0ebe2;">New order #${order.orderNumber}</h2>
    <p style="font-size:14px; line-height:1.7; color:rgba(240,235,226,0.75);">
      ${escapeHtml(order.customerName)} · ${escapeHtml(order.customerEmail)} · ${escapeHtml(order.phone)}<br>
      ${escapeHtml(order.address)}, ${escapeHtml(order.city)}
      ${order.notes ? `<br>Notes: ${escapeHtml(order.notes)}` : ''}
    </p>
    <table style="width:100%; border-collapse:collapse; margin-top:18px; font-size:13px;">
      ${itemsRows(order)}
      ${deliveryRow(order)}
      <tr><td style="padding-top:12px; border-top:1px solid rgba(240,235,226,0.15); font-weight:bold; color:#f0ebe2;">Total</td>
          <td style="padding-top:12px; border-top:1px solid rgba(240,235,226,0.15); text-align:right; font-weight:bold; color:#f0ebe2;">${PKR(order.totalAmount)}</td></tr>
    </table>
    <p style="margin-top:20px; font-size:13px; line-height:1.7; color:rgba(150,220,235,0.9);">Payment method: <strong>${paymentLabel}</strong>${order.paymentMethod === 'BANK_TRANSFER' ? ' — watch WhatsApp for the payment screenshot before shipping.' : ''}</p>
  `);
  return { subject: `New order #${order.orderNumber} — ${paymentLabel}`, html, attachments: [] };
}

const STATUS_COPY = {
  PENDING: {
    subject: 'Your INFUSO order is pending',
    heading: 'Order #{n} pending',
    message: 'Your order is being reviewed and will be confirmed shortly.',
  },
  CONFIRMED: {
    subject: 'Your INFUSO order is confirmed',
    heading: 'Order #{n} confirmed ✓',
    message: 'Great news — your order has been confirmed and is now being prepared.',
  },
  SHIPPED: {
    subject: 'Your INFUSO order has shipped',
    heading: 'Order #{n} shipped',
    message: "Your order is on its way! We'll let you know once it's delivered.",
  },
  DELIVERED: {
    subject: 'Your INFUSO order has been delivered',
    heading: 'Order #{n} delivered ✓',
    message: 'Your order has been delivered. We hope you love it.',
  },
  CANCELLED: {
    subject: 'Your INFUSO order has been cancelled',
    heading: 'Order #{n} cancelled',
    message: "Your order has been cancelled. If this wasn't expected, please contact us.",
  },
};

// Sent whenever an admin changes an order's status — keeps the customer in
// the loop without them having to ask.
function orderStatusEmail(order, status, settings = {}) {
  const copy = STATUS_COPY[status] || STATUS_COPY.PENDING;
  const html = wrapper(`
    <h2 style="margin:0 0 12px; font-family:Georgia,serif; font-weight:400; color:#f0ebe2;">${copy.heading.replace('{n}', order.orderNumber)}</h2>
    <p style="font-size:14px; line-height:1.7; color:rgba(240,235,226,0.75);">${escapeHtml(order.customerName)}, ${escapeHtml(copy.message)}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:18px; font-size:13px;">
      ${itemsRows(order)}
      ${deliveryRow(order)}
      <tr><td style="padding-top:12px; border-top:1px solid rgba(240,235,226,0.15); font-weight:bold; color:#f0ebe2;">Total</td>
          <td style="padding-top:12px; border-top:1px solid rgba(240,235,226,0.15); text-align:right; font-weight:bold; color:#f0ebe2;">${PKR(order.totalAmount)}</td></tr>
    </table>
    <p style="margin-top:20px; font-size:13px; line-height:1.7; color:rgba(240,235,226,0.6);">Delivering to: ${escapeHtml(order.address)}, ${escapeHtml(order.city)}</p>
  `);
  return { subject: copy.subject, html, attachments: [] };
}

function newsletterWelcomeEmail() {
  const html = wrapper(`
    <h2 style="margin:0 0 12px; font-family:Georgia,serif; font-weight:400; color:#f0ebe2;">You're on the list</h2>
    <p style="font-size:14px; line-height:1.7; color:rgba(240,235,226,0.75);">Thank you for subscribing to INFUSO. You'll be the first to hear about new compositions, restocks, and members-only offers.</p>
  `);
  return { subject: 'Welcome to INFUSO', html, attachments: [] };
}

function newsletterAdminNotifyEmail(email) {
  const html = wrapper(`
    <h2 style="margin:0 0 12px; font-family:Georgia,serif; font-weight:400; color:#f0ebe2;">New newsletter subscriber</h2>
    <p style="font-size:14px; line-height:1.7; color:rgba(240,235,226,0.75);">${escapeHtml(email)}</p>
  `);
  return { subject: 'New newsletter subscriber', html, attachments: [] };
}

module.exports = {
  codConfirmationEmail, bankTransferEmail, adminNotificationEmail, orderStatusEmail,
  newsletterWelcomeEmail, newsletterAdminNotifyEmail,
};
