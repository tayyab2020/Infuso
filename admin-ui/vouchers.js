let vouchersById = {};

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

function toDateInputValue(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

function renderVoucherRow(v) {
  return `
    <tr data-id="${v.id}">
      <td>${escapeHtml(v.code)}</td>
      <td>${v.discountPercent}%</td>
      <td class="hint">${fmtDate(v.startsAt)}</td>
      <td class="hint">${fmtDate(v.expiresAt)}</td>
      <td><input type="checkbox" class="active-input" ${v.active ? 'checked' : ''} style="width:auto;" /></td>
      <td class="btn-row">
        <button class="btn secondary edit-btn" type="button">Edit</button>
        <button class="btn danger delete-btn" type="button">Delete</button>
      </td>
    </tr>
  `;
}

async function loadVouchers() {
  const body = document.getElementById('vouchers-body');
  const vouchers = await api('/vouchers');
  vouchersById = Object.fromEntries(vouchers.map((v) => [v.id, v]));

  body.innerHTML = vouchers.length
    ? vouchers.map(renderVoucherRow).join('')
    : '<tr><td colspan="6" class="hint">No vouchers yet.</td></tr>';

  body.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');

    row.querySelector('.active-input').addEventListener('change', async (e) => {
      const active = e.target.checked;
      e.target.disabled = true;
      try {
        await api(`/vouchers/${id}`, { method: 'PUT', body: JSON.stringify({ active }) });
      } catch (err) {
        alert(err.message);
        e.target.checked = !active;
      } finally {
        e.target.disabled = false;
      }
    });

    row.querySelector('.edit-btn').addEventListener('click', () => openEditPanel(vouchersById[id]));

    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this voucher?')) return;
      try {
        await api(`/vouchers/${id}`, { method: 'DELETE' });
        row.remove();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function openEditPanel(v) {
  document.getElementById('edit-panel-title').textContent = 'Edit voucher';
  document.getElementById('edit-id').value = v.id;
  document.getElementById('edit-code').value = v.code;
  document.getElementById('edit-percent').value = v.discountPercent;
  document.getElementById('edit-starts').value = toDateInputValue(v.startsAt);
  document.getElementById('edit-expires').value = toDateInputValue(v.expiresAt);
  document.getElementById('edit-active').checked = !!v.active;
  document.getElementById('edit-error').style.display = 'none';
  const panel = document.getElementById('edit-panel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('cancel-edit').addEventListener('click', () => {
  document.getElementById('edit-panel').style.display = 'none';
});

document.getElementById('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const errorEl = document.getElementById('edit-error');
  errorEl.style.display = 'none';
  try {
    await api(`/vouchers/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        code: document.getElementById('edit-code').value.trim(),
        discountPercent: Number(document.getElementById('edit-percent').value || 0),
        startsAt: document.getElementById('edit-starts').value || null,
        expiresAt: document.getElementById('edit-expires').value || null,
        active: document.getElementById('edit-active').checked,
      }),
    });
    document.getElementById('edit-panel').style.display = 'none';
    await loadVouchers();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('add-error');
  errorEl.style.display = 'none';
  try {
    await api('/vouchers', {
      method: 'POST',
      body: JSON.stringify({
        code: document.getElementById('new-code').value.trim(),
        discountPercent: Number(document.getElementById('new-percent').value || 0),
        startsAt: document.getElementById('new-starts').value || null,
        expiresAt: document.getElementById('new-expires').value || null,
      }),
    });
    document.getElementById('add-form').reset();
    await loadVouchers();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

mountSidebar('vouchers');
requireAuthAndWireLogout().then(loadVouchers).catch(() => {});
