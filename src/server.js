require('dotenv/config');
const path = require('path');
const express = require('express');
const session = require('express-session');

const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const adminRouter = require('./routes/admin');
const faqsRouter = require('./routes/faqs');
const settingsRouter = require('./routes/settings');
const newsletterRouter = require('./routes/newsletter');

const app = express();

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
  },
}));

// ---- API ----
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/faqs', faqsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/newsletter', newsletterRouter);

// ---- Static sites ----
// HTML/JS/CSS must always revalidate so a deploy is visible on next load
// without needing a manual cache clear; images/video are safe to cache
// aggressively (uploads already get unique, content-addressed filenames).
function setStaticCacheHeaders(res, filePath) {
  const noCacheExt = ['.html', '.js', '.css'];
  if (noCacheExt.includes(path.extname(filePath))) {
    // no-store (not just no-cache) — Cloudflare treats a bare "no-cache" as
    // "cache at the edge, just revalidate" and substitutes its own browser
    // TTL, which defeats the point. no-store is unambiguous: never cache.
    res.setHeader('Cache-Control', 'no-store');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
  }
}

// Pretty product URLs (/product/aether) — serves the same standalone
// product.dc.html file; the page itself reads the slug from the path.
app.get('/product/:slug', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, '..', 'public', 'product.dc.html'));
});

// Customer storefront (the existing design, unchanged filename).
app.use(express.static(path.join(__dirname, '..', 'public'), {
  index: 'AETHER Landing.dc.html',
  setHeaders: setStaticCacheHeaders,
}));

// Admin UI — plain functional pages, separate from the storefront design.
app.use('/admin', express.static(path.join(__dirname, '..', 'admin-ui'), {
  index: 'login.html',
  setHeaders: setStaticCacheHeaders,
}));

app.use((req, res) => res.status(404).send('Not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`INFUSO store running at http://localhost:${PORT}`);
  console.log(`Admin panel at        http://localhost:${PORT}/admin`);
});
