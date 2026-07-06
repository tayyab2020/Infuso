require('dotenv/config');
const path = require('path');
const express = require('express');
const session = require('express-session');

const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const adminRouter = require('./routes/admin');
const faqsRouter = require('./routes/faqs');
const settingsRouter = require('./routes/settings');
const deployWebhookRouter = require('./routes/deployWebhook');

const app = express();

// Captures the raw request body alongside the parsed JSON so the deploy
// webhook can verify GitHub's HMAC signature (which is computed over the
// exact raw bytes, not the re-serialized parsed object).
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
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
app.use('/api/deploy-webhook', deployWebhookRouter);

// ---- Static sites ----
// Customer storefront (the existing design, unchanged filename).
app.use(express.static(path.join(__dirname, '..', 'public'), {
  index: 'AETHER Landing.dc.html',
}));

// Admin UI — plain functional pages, separate from the storefront design.
app.use('/admin', express.static(path.join(__dirname, '..', 'admin-ui'), {
  index: 'login.html',
}));

app.use((req, res) => res.status(404).send('Not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`INFUSO store running at http://localhost:${PORT}`);
  console.log(`Admin panel at        http://localhost:${PORT}/admin`);
});
