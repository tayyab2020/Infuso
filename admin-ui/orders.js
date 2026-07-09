const STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'PAYMENT_RECEIVED', 'CANCELLED'];

let allProducts = [];
let ordersById = {};

function renderOrderRow(order) {
  const itemsHtml = order.items.map((it) =>
    `<div>${it.quantity} × ${escapeHtml(it.productName)}</div>`
  ).join('') + (order.deliveryCharge ? `<div class="hint">+ Delivery: ${money(order.deliveryCharge)}</div>` : '');

  // Payment Received only makes sense for COD orders (bank transfer orders are
  // already confirmed as paid before shipping via the CONFIRMED status).
  const statusChoices = STATUSES.filter((s) => s !== 'PAYMENT_RECEIVED' || order.paymentMethod === 'COD' || order.status === 'PAYMENT_RECEIVED');
  const statusOptions = statusChoices.map((s) =>
    `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s.replace('_', ' ')}</option>`
  ).join('');

  const date = new Date(order.createdAt).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return `
    <tr data-id="${order.id}">
      <td class="order-number">#${order.orderNumber}</td>
      <td>${date}</td>
      <td>${escapeHtml(order.customerName)}</td>
      <td>${escapeHtml(order.phone)}<br><span class="hint">${escapeHtml(order.customerEmail || '')} · ${escapeHtml(order.city)}</span><br><span class="hint">${escapeHtml(order.address)}</span>${order.notes ? `<br><span class="hint">Note: ${escapeHtml(order.notes)}</span>` : ''}</td>
      <td class="order-items">${itemsHtml}</td>
      <td>${money(order.totalAmount)}</td>
      <td>${order.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : 'COD'}</td>
      <td>
        <select class="status-select status-${order.status}">${statusOptions}</select>
      </td>
      <td class="btn-row">
        <button class="btn secondary items-btn" type="button">Edit items</button>
        <button class="btn danger delete-btn" type="button">Delete</button>
      </td>
    </tr>
  `;
}

async function loadOrders() {
  const body = document.getElementById('orders-body');
  const [orders, products] = await Promise.all([api('/orders'), api('/products')]);
  allProducts = products.filter((p) => p.active);
  ordersById = Object.fromEntries(orders.map((o) => [o.id, o]));

  if (!orders.length) {
    body.innerHTML = '<tr><td colspan="9" class="hint">No orders yet.</td></tr>';
    return;
  }
  body.innerHTML = orders.map(renderOrderRow).join('');

  body.querySelectorAll('tr').forEach((row) => {
    const select = row.querySelector('.status-select');
    let prevStatus = select.value;
    select.addEventListener('change', async () => {
      const id = row.getAttribute('data-id');
      const nextStatus = select.value;
      select.disabled = true;
      try {
        await api(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
        select.className = 'status-select status-' + nextStatus;
        prevStatus = nextStatus;
      } catch (err) {
        alert(err.message);
        select.value = prevStatus;
      } finally {
        select.disabled = false;
      }
    });

    row.querySelector('.delete-btn').addEventListener('click', async () => {
      const id = row.getAttribute('data-id');
      if (!confirm(`Delete order #${row.querySelector('.order-number').textContent.replace('#', '')}? This cannot be undone.`)) return;
      try {
        await api(`/orders/${id}`, { method: 'DELETE' });
        row.remove();
      } catch (err) {
        alert(err.message);
      }
    });

    row.querySelector('.items-btn').addEventListener('click', () => {
      openItemsPanel(ordersById[row.getAttribute('data-id')]);
    });
  });
}

function openItemsPanel(order) {
  document.getElementById('items-edit-order-number').textContent = '#' + order.orderNumber;

  const qtyByProductId = Object.fromEntries(order.items.map((it) => [it.productId, it.quantity]));
  document.getElementById('items-edit-rows').innerHTML = allProducts.map((p) => `
    <div class="field" data-slug="${p.slug}" style="flex-direction:row; align-items:center; gap:12px;">
      <label style="flex:1; text-transform:none; font-weight:400; font-size:13px; color:var(--text);">${escapeHtml(p.name)} <span class="hint">(${money(p.price)})</span></label>
      <input type="number" class="items-qty-input" min="0" style="width:90px;" value="${qtyByProductId[p.id] || 0}" />
    </div>
  `).join('');

  document.getElementById('items-edit-error').style.display = 'none';
  document.getElementById('items-edit-panel').dataset.orderId = order.id;
  const panel = document.getElementById('items-edit-panel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('items-cancel-edit').addEventListener('click', () => {
  document.getElementById('items-edit-panel').style.display = 'none';
});

document.getElementById('items-save-btn').addEventListener('click', async () => {
  const panel = document.getElementById('items-edit-panel');
  const orderId = panel.dataset.orderId;
  const errorEl = document.getElementById('items-edit-error');
  errorEl.style.display = 'none';

  const items = [];
  panel.querySelectorAll('#items-edit-rows [data-slug]').forEach((row) => {
    const quantity = Number(row.querySelector('.items-qty-input').value || 0);
    if (quantity > 0) items.push({ slug: row.getAttribute('data-slug'), quantity });
  });
  if (!items.length) {
    errorEl.textContent = 'An order needs at least one item.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    await api(`/orders/${orderId}/items`, { method: 'PUT', body: JSON.stringify({ items }) });
    panel.style.display = 'none';
    await loadOrders();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

mountSidebar('orders');
requireAuthAndWireLogout().then(loadOrders).catch(() => {});
