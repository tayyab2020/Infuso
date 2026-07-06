require('dotenv/config');
const path = require('path');
const express = require('express');
const session = require('express-session');

const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const adminRouter = require('./routes/admin');
const faqsRouter = require('./routes/faqs');
const settingsRouter = require('./routes/settings');

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
