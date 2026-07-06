# INFUSO Store

A Node.js/Express + PostgreSQL e-commerce backend for the INFUSO fragrance storefront: customers can browse, add to cart, and place cash-on-delivery orders; admins can view/manage orders and product price & stock through a separate admin panel.

## Stack

- **Backend:** Node.js, Express 5, Prisma ORM, PostgreSQL
- **Storefront:** the existing `AETHER Landing.dc.html` single-page design (unchanged visually), now fetching live product price/stock and submitting real orders instead of static/fake cart state
- **Admin panel:** plain server-rendered static pages (no framework), session-based login

## Project layout

```
public/              storefront (served at /) — HTML, support.js, product images/frames
admin-ui/             admin panel (served at /admin) — login, orders, products pages
src/
  server.js           Express app entry
  db.js               Prisma client singleton
  middleware/
    requireAdmin.js   session-auth guard for admin API routes
  routes/
    products.js        GET /api/products (public)
    orders.js           POST /api/orders (public — place an order)
    admin.js            /api/admin/* (login/logout/me, orders, products CRUD)
prisma/
  schema.prisma        Product / Order / OrderItem / AdminUser models
  seed.js              seeds the 3 products + first admin login
```

## First-time setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Configure `.env`** (already created for local dev — review before deploying anywhere):
   - `DATABASE_URL` — PostgreSQL connection string
   - `SESSION_SECRET` — change this to a long random string before deploying
   - `PORT` — defaults to 3001
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — used only once by the seed script to create the first admin login

3. **Create the database schema**
   ```
   npm run prisma:migrate
   ```

4. **Seed products + admin user**
   ```
   npm run seed
   ```

## Running

```
npm run dev      # auto-restarts on file changes (nodemon)
npm start        # plain node
```

Then visit:
- Storefront: `http://localhost:3001/`
- Admin panel: `http://localhost:3001/admin` (log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`)

## Notes on scope

- **Checkout is cash-on-delivery only** — no payment gateway is integrated. Placing an order collects name/phone/address/city and creates a `PENDING` order for the admin to confirm.
- **Guest checkout only** — no customer accounts/login, matching the original single-page cart flow.
- **Product presentation** (images, taglines, colors, notes, gradients) stays hardcoded in the storefront's own script, exactly as designed. Only **price and stock** are live from the database — that's the data an admin actually needs to manage day-to-day. Renaming/restyling a product still means editing the HTML; changing its price or inventory is done from `/admin/products.html`.
- **Sessions** use `express-session`'s default in-memory store — fine for local use/single instance, but sessions won't survive a server restart and won't work across multiple instances. Swap in a persistent store (e.g. `connect-pg-simple`) before any real production deployment.
- Deleting a product that already has orders is blocked (foreign key) — use the **Active** checkbox to hide it from the storefront instead.
