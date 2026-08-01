// Shared cart + checkout logic used by every storefront page
// (AETHER Landing.dc.html, product.dc.html, and any future one). Loaded as a
// plain <script> — not a module, since the dc-runtime template compiler works
// per-file and has no proven cross-file include for HTML/JSX in this project
// (see the CATALOG duplication note in product.dc.html for the same
// constraint). This file is the single source of truth for what actually
// *happens* on add-to-cart, voucher validation, and order submission, so a
// checkout bug fix or rule change only has to be made once — each page still
// keeps its own copy of the drawer's declarative {{ }} markup and React
// state, wired to these functions.
(function () {
  const CART_STORAGE_KEY = 'infuso_cart';
  const CART_IDS = ['aether', 'aria', 'oudor'];

  function loadStoredCart() {
    const empty = { aether: 0, aria: 0, oudor: 0 };
    try {
      const raw = window.localStorage && localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return empty;
      const parsed = JSON.parse(raw);
      const out = {};
      for (const id of CART_IDS) out[id] = Math.max(0, parseInt(parsed[id], 10) || 0);
      return out;
    } catch (e) { return empty; }
  }

  function persistCart(cart) {
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (e) {}
  }

  function cartCount(cart) {
    return CART_IDS.reduce((sum, id) => sum + (cart[id] || 0), 0);
  }

  // Fires a Meta Pixel event — safe no-op if fbq never loaded (blocked by an
  // ad-blocker, offline, etc).
  function fbTrack(eventName, params, eventId) {
    try {
      if (typeof window.fbq === 'function') {
        window.fbq('track', eventName, params, eventId ? { eventID: eventId } : undefined);
      }
    } catch (e) {}
  }

  function defaultCheckoutForm() {
    return { customerName: '', customerEmail: '', phone: '', address: '', city: '', notes: '', paymentMethod: 'COD' };
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
  }

  // null means "no voucher applied"; otherwise voucher is { code, discountPercent }.
  function computeDiscount(subtotal, voucher) {
    const discountPercent = voucher ? voucher.discountPercent : 0;
    const discountAmount = discountPercent ? Math.round(subtotal * discountPercent / 100) : 0;
    return { discountPercent, discountAmount };
  }

  async function validateVoucher(code) {
    const res = await fetch('/api/vouchers/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Invalid discount code.');
    return { code: data.code, discountPercent: data.discountPercent };
  }

  // Returns an error message string, or null if the form is good to submit.
  function validateCheckoutForm(form) {
    const { customerName, customerEmail, phone, address, city } = form;
    if (!customerName.trim() || !customerEmail.trim() || !phone.trim() || !address.trim() || !city.trim()) {
      return 'Please fill in all required fields.';
    }
    if (!isValidEmail(customerEmail)) return 'Please enter a valid email address.';
    return null;
  }

  // Places the order server-side. `items` is [{ slug, quantity }]. Returns
  // { order, fbEventId } on success — order includes the authoritative
  // discountAmount/totalAmount so the caller doesn't have to re-derive them
  // for its Purchase pixel event. Throws with a user-facing message on failure.
  async function placeOrder({ form, items, voucherCode, fbEventSourceUrl }) {
    const fbEventId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: form.customerName, customerEmail: form.customerEmail, phone: form.phone,
        address: form.address, city: form.city, notes: form.notes, paymentMethod: form.paymentMethod,
        items, voucherCode, fbEventId, fbEventSourceUrl,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to place order.');
    return { order: data, fbEventId };
  }

  window.InfusoCart = {
    CART_IDS,
    loadStoredCart, persistCart, cartCount, fbTrack,
    defaultCheckoutForm, computeDiscount,
    validateVoucher, validateCheckoutForm, placeOrder,
  };
})();
