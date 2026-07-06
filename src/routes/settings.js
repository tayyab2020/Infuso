const express = require('express');
const prisma = require('../db');

const router = express.Router();

// Public: site-wide content settings (branding/social/bank/section copy).
// Never 404s — the storefront falls back to its own hardcoded copy if this is empty.
router.get('/', async (req, res) => {
  const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
  res.json(settings || {});
});

module.exports = router;
