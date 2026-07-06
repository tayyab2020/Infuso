// Shared helpers for the admin panel — plain vanilla JS, no build step.

async function api(path, options, { redirectOn401 = true } = {}) {
  const opts = { credentials: 'same-origin', ...options };
  const isFormData = opts.body instanceof FormData;
  opts.headers = isFormData
    ? { ...(options && options.headers) }
    : { 'Content-Type': 'application/json', ...(options && options.headers) };

  const res = await fetch('/api/admin' + path, opts);
  if (res.status === 401 && redirectOn401) {
    window.location.href = '/admin/login.html';
    throw new Error('Not authenticated');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Uploads a single image file to the admin upload endpoint, returns its public URL.
async function uploadImage(file) {
  const fd = new FormData();
  fd.append('file', file);
  const { url } = await api('/upload', { method: 'POST', body: fd });
  return url;
}

function money(n) {
  return 'PKR ' + Number(n).toLocaleString('en-PK');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const ADMIN_NAV = [
  { key: 'orders', label: 'Orders', href: '/admin/orders.html' },
  { key: 'products', label: 'Products', href: '/admin/products.html' },
  { key: 'faqs', label: 'FAQs', href: '/admin/faqs.html' },
  { key: 'settings', label: 'Settings', href: '/admin/settings.html' },
];

// Injects the fixed sidebar (logo + nav + logout) without needing every page
// to hand-duplicate the markup — pages just call mountSidebar('products') etc.
// The sidebar is position:fixed and .admin-main carries a matching margin-left,
// so no existing page content needs to be relocated into a wrapper.
function mountSidebar(activeKey) {
  const nav = document.createElement('div');
  nav.className = 'admin-sidebar';
  nav.innerHTML = `
    <div class="sidebar-logo">
      <img id="sidebar-logo-img" src="/products/infuso-logo.png" alt="INFUSO" onerror="this.style.display='none'" />
    </div>
    <nav class="sidebar-links">
      ${ADMIN_NAV.map((p) => `<a href="${p.href}" class="${p.key === activeKey ? 'active' : ''}">${escapeHtml(p.label)}</a>`).join('')}
    </nav>
    <button id="logout-btn" class="sidebar-logout">Log out</button>
  `;
  document.body.prepend(nav);

  // Best-effort: reflect a custom uploaded logo if one's been set in Settings.
  api('/settings', {}, { redirectOn401: false })
    .then((s) => {
      if (s && s.logoUrl) document.getElementById('sidebar-logo-img').src = s.logoUrl;
    })
    .catch(() => {});
}

async function requireAuthAndWireLogout() {
  await api('/me'); // redirects to login on 401
  const btn = document.getElementById('logout-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      await api('/logout', { method: 'POST' });
      window.location.href = '/admin/login.html';
    });
  }
}
