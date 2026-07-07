const STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

function renderOrderRow(order) {
  const itemsHtml = order.items.map((it) =>
    `<div>${it.quantity} × ${escapeHtml(it.productName)}</div>`
  ).join('') + (order.deliveryCharge ? `<div class="hint">+ Delivery: ${money(order.deliveryCharge)}</div>` : '');

  const statusOptions = STATUSES.map((s) =>
    `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`
  ).join('');

  const date = new Date(order.createdAt).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return `
    <tr data-id="${order.id}">
      <td class="order-number">#${order.orderNumber}</td>
      <td>${date}</td>
      <td>${escapeHtml(order.customerName)}</td>
      <td>${escapeHtml(order.phone)}<br><span class="hint">${escapeHtml(order.customerEmail || '')} · ${escapeHtml(order.city)}</span>${order.notes ? `<br><span class="hint">Note: ${escapeHtml(order.notes)}</span>` : ''}</td>
      <td class="order-items">${itemsHtml}</td>
      <td>${money(order.totalAmount)}</td>
      <td>${order.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : 'COD'}</td>
      <td>
        <select class="status-select status-${order.status}">${statusOptions}</select>
      </td>
      <td><button class="btn danger delete-btn" type="button">Delete</button></td>
    </tr>
  `;
}

async function loadOrders() {
  const body = document.getElementById('orders-body');
  const orders = await api('/orders');
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
  });
}

mountSidebar('orders');
requireAuthAndWireLogout().then(loadOrders).catch(() => {});
