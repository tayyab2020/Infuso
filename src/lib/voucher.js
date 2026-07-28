const prisma = require('../db');

function normalizeCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

// Looks up a voucher by code and checks it's actually usable right now.
// Used by both the public "validate this code" endpoint and checkout itself —
// checkout re-checks server-side rather than trusting whatever the client
// validated earlier, since a code can expire or get deactivated in between.
async function resolveVoucher(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { error: 'Enter a discount code.' };

  const voucher = await prisma.voucher.findUnique({ where: { code } });
  if (!voucher || !voucher.active) return { error: 'Invalid discount code.' };

  const now = new Date();
  if (voucher.startsAt && now < voucher.startsAt) return { error: 'This discount code is not active yet.' };
  if (voucher.expiresAt && now > voucher.expiresAt) return { error: 'This discount code has expired.' };

  return { voucher };
}

module.exports = { resolveVoucher, normalizeCode };
