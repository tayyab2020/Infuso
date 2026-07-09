// One-off sync: copies the storefront's current hardcoded content into the
// database so the admin panel shows what's actually live on the site instead
// of blank fields. Safe to re-run — only fills in fields that are still
// null/empty, never overwrites content an admin has already customized.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PRODUCTS = {
  aether: {
    priceOld: 4500,
    imageUrl: '/products/aether.webp',
    hoverImageUrl: '/products/aether_box.webp',
    editorialTallImageUrl: '/products/aether_dark.webp',
    editorialWideImageUrl: '/products/aether_slate.webp',
    tagline: 'cold air over stone',
    topNote: 'Sea Mineral',
    heartNote: 'Iris · Smoke',
    baseNote: 'Amber Resin',
    description: 'Clear and mineral at the first breath, warming through iris and a wisp of smoke, drying to a quiet resin that stays close to the skin.',
    inspiredBy: 'INSPIRED BY L’IMMENSITÉ · LOUIS VUITTON',
    editorialLine: 'Cold air over stone.',
    editorialStory: 'Shot on wet slate under a single shaft of light — mineral, cool and clean, the way it opens on skin.',
  },
  aria: {
    priceOld: 4500,
    imageUrl: '/products/aria.webp',
    hoverImageUrl: '/products/aria_box.webp',
    editorialTallImageUrl: '/products/aria_hands.webp',
    editorialWideImageUrl: '/products/aria_citrus.webp',
    tagline: 'light through open air',
    topNote: 'Bergamot',
    heartNote: 'White Fruit',
    baseNote: 'Soft Musk',
    description: 'A bright, luminous fruit accord suspended over clean musk — airy and effortless, the scent of light moving through an open window.',
    inspiredBy: 'INSPIRED BY ERBA PURA · XERJOFF',
    editorialLine: 'Light through open air.',
    editorialStory: 'Held in warm daylight beside cut citrus and marble — luminous, weightless, effortlessly bright.',
  },
  oudor: {
    priceOld: 4500,
    imageUrl: '/products/oudor.webp',
    hoverImageUrl: '/products/oudor_box.webp',
    editorialTallImageUrl: '/products/oudor_wood.webp',
    editorialWideImageUrl: '/products/oudor_rocks.webp',
    tagline: 'warmth after dark',
    topNote: 'Saffron',
    heartNote: 'Oud · Incense',
    baseNote: 'Amber · Woods',
    description: 'Deep and resinous — saffron over smoked oud and incense, settling into warm amber and woods. The house at its most opulent.',
    inspiredBy: 'INSPIRED BY TERRONI · ORTO PARISI',
    editorialLine: 'Warmth after dark.',
    editorialStory: 'Laid among agarwood, ember and resin against black stone — deep, smoky and opulent.',
  },
};

const FAQS = [
  { q: 'Where do you deliver?', a: 'We deliver across Pakistan through our trusted courier partners.' },
  { q: 'How long does delivery take?', a: 'Orders are typically delivered within 2–6 business days, depending on your location.' },
  { q: 'How long do Infuso perfumes last?', a: 'Our fragrances offer an average longevity of 7–8+ hours. Performance may vary based on skin type, weather, and application.' },
  { q: 'How can I make my fragrance last longer?', a: 'Apply your fragrance to clean, moisturized skin and pulse points such as the wrists, neck, and behind the ears. Avoid rubbing the fragrance after application.' },
  { q: 'Can I return or exchange my order?', a: 'Returns or exchanges are only accepted if you receive the wrong product or if the item arrives damaged or defective. Requests must be made within 48 hours of delivery.' },
  { q: 'What should I do if I receive a damaged or incorrect item?', a: "Contact our customer support within 48 hours of receiving your order, along with clear photos of the product and packaging. We'll review your request and arrange a replacement if eligible." },
  { q: 'Are your perfumes original?', a: 'Yes. Every Infuso fragrance is carefully crafted using premium-quality ingredients to deliver a luxurious scent experience with excellent performance.' },
];

const SETTINGS = {
  logoUrl: '/products/infuso-logo.png',
  facebookUrl: 'https://www.facebook.com/profile.php?id=61590700033553&mibextid=wwXIfr&mibextid=wwXIfr',
  instagramUrl: 'https://www.instagram.com/infuso.pk?igsh=MXYyaDh2bnM5em01cA%3D%3D&utm_source=qr',
  contactEmail: 'sales@infuso.pk',
  whatsappNumber: '923316841320',
  bankAccountName: 'Minahil Asim',
  bankName: 'Bank Al Habib',
  bankAccountNumber: '5648-1829-000802-01-2',
  bankIban: 'PK24BAHL5648182900080201',
  bankQrImageUrl: '/products/bank-qr.png',
  mailFromName: 'INFUSO',
  mailFromAddress: 'sales@infuso.pk',
  codEmailSubject: 'Your INFUSO order has been received',
  codEmailIntro: "Hi {{customerName}}, thank you for your order. We've received it and will confirm it shortly — it'll be paid for by Cash on Delivery when it arrives.",
  bankEmailSubject: 'Complete your INFUSO payment — bank transfer details',
  bankEmailIntro: 'Hi {{customerName}}, thank you for your order. Please complete payment via bank transfer using the details below.',
  houseEyebrow: 'BRAND INTRODUCTION',
  houseBody: "At INFUSO, we believe fragrance is the most powerful thing people remember about you. It can't be seen. It doesn't need to be. Every bottle is created for those who choose to speak without words, command attention without effort, and leave behind something unforgettable.",
  editorialEyebrow: 'CAMPAIGN · SS26',
  editorialHeading: 'Three moods, in still life.',
  editorialBody: 'Each composition, photographed with the world it was drawn from — stone and leaf, citrus and light, oud and ember.',
  discoveryEyebrow: 'PRESENTED IN GLASS & STONE',
  discoveryHeading: 'The Discovery Set',
  discoveryBody: 'All three compositions, each boxed in its signature vessel. The complete olfactory map of the house.',
  faqEyebrow: 'QUESTIONS',
  faqHeading: 'Frequently Asked Questions',
  footerCopyright: '© 2026 INFUSO',
};

async function main() {
  for (const [slug, content] of Object.entries(PRODUCTS)) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing) { console.log(`skip ${slug}: no such product`); continue; }
    const data = {};
    for (const [key, value] of Object.entries(content)) {
      if (existing[key] === null || existing[key] === undefined) data[key] = value;
    }
    if (Object.keys(data).length) {
      await prisma.product.update({ where: { slug }, data });
      console.log(`synced ${slug}: ${Object.keys(data).join(', ')}`);
    } else {
      console.log(`skip ${slug}: already customized`);
    }
  }

  const faqCount = await prisma.faq.count();
  if (faqCount === 0) {
    for (let i = 0; i < FAQS.length; i++) {
      await prisma.faq.create({ data: { question: FAQS[i].q, answer: FAQS[i].a, order: i } });
    }
    console.log(`synced ${FAQS.length} FAQs.`);
  } else {
    console.log(`skip FAQs: ${faqCount} already exist.`);
  }

  const settings = await prisma.siteSettings.upsert({
    where: { id: 'singleton' }, update: {}, create: { id: 'singleton' },
  });
  const data = {};
  for (const [key, value] of Object.entries(SETTINGS)) {
    if (settings[key] === null || settings[key] === undefined) data[key] = value;
  }
  if (Object.keys(data).length) {
    await prisma.siteSettings.update({ where: { id: 'singleton' }, data });
    console.log(`synced settings: ${Object.keys(data).join(', ')}`);
  } else {
    console.log('skip settings: already customized');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
