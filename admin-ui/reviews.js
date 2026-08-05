let productOptions = [];
let editingId = null; // null = add mode, otherwise the review id being edited

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function stars(rating) {
  return '★★★★★☆☆☆☆☆'.slice(5 - rating, 10 - rating);
}

function renderReviewRow(r) {
  const date = new Date(r.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
  return `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.product.name)}</td>
      <td>${r.quantity}</td>
      <td>${escapeHtml(r.customerName)}<br><span class="hint">${date}</span></td>
      <td>${stars(r.rating)}</td>
      <td>${escapeHtml(truncate(r.comment, 90))}</td>
      <td class="hint">${escapeHtml(r.orderNumber || '—')}</td>
      <td><input type="checkbox" class="approved-input" ${r.approved ? 'checked' : ''} style="width:auto;" /></td>
      <td class="btn-row">
        <button class="btn secondary edit-btn" type="button">Edit</button>
        <button class="btn danger delete-btn" type="button">Delete</button>
      </td>
    </tr>
  `;
}

let reviewsById = {};

async function loadReviews() {
  const body = document.getElementById('reviews-body');
  const reviews = await api('/reviews');
  reviewsById = Object.fromEntries(reviews.map((r) => [r.id, r]));

  body.innerHTML = reviews.length
    ? reviews.map(renderReviewRow).join('')
    : '<tr><td colspan="8" class="hint">No reviews yet.</td></tr>';

  body.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');

    row.querySelector('.approved-input').addEventListener('change', async (e) => {
      const approved = e.target.checked;
      e.target.disabled = true;
      try {
        await api(`/reviews/${id}`, { method: 'PATCH', body: JSON.stringify({ approved }) });
        reviewsById[id].approved = approved;
      } catch (err) {
        alert(err.message);
        e.target.checked = !approved;
      } finally {
        e.target.disabled = false;
      }
    });

    row.querySelector('.edit-btn').addEventListener('click', () => openEditReview(reviewsById[id]));

    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this review?')) return;
      try {
        await api(`/reviews/${id}`, { method: 'DELETE' });
        row.remove();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function renderProductChecklist() {
  const container = document.getElementById('product-checklist');
  container.innerHTML = productOptions.map((p) => `
    <label style="display:flex; align-items:center; gap:10px; text-transform:none; font-weight:400; font-size:13px; padding:6px 0;">
      <input type="checkbox" class="product-check" value="${p.id}" style="width:auto;" />
      <span style="min-width:140px;">${escapeHtml(p.name)}</span>
      <span style="display:flex; align-items:center; gap:6px; color:var(--muted); font-size:12px;">Qty
        <input type="number" class="product-qty" min="1" value="1" disabled style="width:64px; padding:4px 6px;" />
      </span>
    </label>
  `).join('');

  container.querySelectorAll('.product-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      cb.closest('label').querySelector('.product-qty').disabled = !cb.checked;
    });
  });
}

async function loadProductOptions() {
  const products = await api('/products');
  productOptions = products;
  const select = document.getElementById('edit-productId');
  select.innerHTML = products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  renderProductChecklist();
}

function resetReviewForm() {
  editingId = null;
  document.getElementById('form-title').textContent = 'Add review';
  document.getElementById('form-submit-btn').textContent = 'Add';
  document.getElementById('cancel-edit-review').style.display = 'none';
  document.getElementById('product-multi-field').style.display = '';
  document.getElementById('product-single-field').style.display = 'none';
  document.getElementById('edit-quantity-field').style.display = 'none';
  document.getElementById('add-form').reset();
  document.getElementById('new-approved').checked = true;
  renderProductChecklist();
}

function openEditReview(r) {
  editingId = r.id;
  document.getElementById('form-title').textContent = `Edit review — ${r.customerName}`;
  document.getElementById('form-submit-btn').textContent = 'Save changes';
  document.getElementById('cancel-edit-review').style.display = 'inline';
  document.getElementById('product-multi-field').style.display = 'none';
  document.getElementById('product-single-field').style.display = '';
  document.getElementById('edit-quantity-field').style.display = '';
  document.getElementById('edit-productId').value = r.productId;
  document.getElementById('edit-quantity').value = r.quantity;
  document.getElementById('new-customerName').value = r.customerName;
  document.getElementById('new-rating').value = String(r.rating);
  document.getElementById('new-comment').value = r.comment;
  document.getElementById('new-orderNumber').value = r.orderNumber || '';
  document.getElementById('new-approved').checked = r.approved;
  document.getElementById('add-error').style.display = 'none';
  document.getElementById('add-form').scrollIntoView({ behavior: 'smooth', block: 'end' });
}

document.getElementById('cancel-edit-review').addEventListener('click', resetReviewForm);

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('add-error');
  errorEl.style.display = 'none';
  const submitBtn = document.getElementById('form-submit-btn');
  submitBtn.disabled = true;

  const shared = {
    customerName: document.getElementById('new-customerName').value.trim(),
    rating: Number(document.getElementById('new-rating').value),
    comment: document.getElementById('new-comment').value.trim(),
    orderNumber: document.getElementById('new-orderNumber').value.trim() || null,
    approved: document.getElementById('new-approved').checked,
  };

  try {
    if (editingId) {
      await api(`/reviews/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...shared,
          productId: document.getElementById('edit-productId').value,
          quantity: Number(document.getElementById('edit-quantity').value) || 1,
        }),
      });
    } else {
      const items = Array.from(document.querySelectorAll('.product-check:checked')).map((cb) => ({
        productId: cb.value,
        quantity: Number(cb.closest('label').querySelector('.product-qty').value) || 1,
      }));
      if (!items.length) throw new Error('Select at least one product.');
      await api('/reviews', { method: 'POST', body: JSON.stringify({ ...shared, items }) });
    }
    resetReviewForm();
    await loadReviews();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
  }
});

mountSidebar('reviews');
requireAuthAndWireLogout().then(() => Promise.all([loadReviews(), loadProductOptions()])).catch(() => {});
