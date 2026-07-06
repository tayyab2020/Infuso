const express = require('express');
const prisma = require('../db');

const router = express.Router();

// Public: list active FAQs in display order.
router.get('/', async (req, res) => {
  const faqs = await prisma.faq.findMany({
    where: { active: true },
    select: { question: true, answer: true },
    orderBy: { order: 'asc' },
  });
  res.json(faqs);
});

module.exports = router;
