const express = require('express');
const { resolveVoucher } = require('../lib/voucher');

const router = express.Router();

// Public: lets the storefront check a discount code at checkout before the
// order is actually placed. Checkout itself re-validates independently —
// this is just for the "Apply" button's instant feedback.
router.post('/validate', async (req, res) => {
  const { code } = req.body || {};
  const { voucher, error } = await resolveVoucher(code);
  if (error) return res.status(400).json({ error });
  res.json({ code: voucher.code, discountPercent: voucher.discountPercent });
});

module.exports = router;
