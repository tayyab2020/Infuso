const IMAGE_FIELDS = ['imageUrl', 'hoverImageUrl', 'editorialTallImageUrl', 'editorialWideImageUrl'];
const TEXT_FIELDS = [
  'name', 'tagline', 'inspiredBy', 'topNote', 'heartNote', 'baseNote',
  'description', 'editorialLine', 'editorialStory',
];

let productsById = {};
let pendingUploads = {};
let currentMode = null; // 'create' | 'edit'
let currentId = null;

function renderProductRow(p) {
  const priceHtml = p.priceOld
    ? `<span style="text-decoration:line-through; color:var(--muted); font-size:11px;">${money(p.priceOld)}</span> ${money(p.price)}`
    : money(p.price);
  const categoryLabel = { MEN: 'Men', WOMEN: 'Women', UNISEX: 'Unisex' }[p.category] || 'Unisex';
  return `
    <tr data-id="${p.id}">
      <td><img class="thumb" src="${p.imageUrl || ''}" alt="" onerror="this.style.visibility='hidden'" /></td>
      <td>${escapeHtml(p.slug)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${categoryLabel}</td>
      <td>${priceHtml}</td>
      <td>${p.stock}</td>
      <td><input type="checkbox" class="active-input" ${p.active ? 'checked' : ''} style="width:auto;" /></td>
      <td>
        <button class="btn secondary edit-btn" type="button">Edit</button>
        <button class="btn danger delete-btn" type="button">Delete</button>
      </td>
    </tr>
  `;
}

async function loadProducts() {
  const body = document.getElementById('products-body');
  const products = await api('/products');
  productsById = Object.fromEntries(products.map((p) => [p.id, p]));

  body.innerHTML = products.length
    ? products.map(renderProductRow).join('')
    : '<tr><td colspan="7" class="hint">No products yet.</td></tr>';

  body.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');

    row.querySelector('.active-input').addEventListener('change', async (e) => {
      const active = e.target.checked;
      e.target.disabled = true;
      try {
        await api(`/products/${id}`, { method: 'PUT', body: JSON.stringify({ active }) });
      } catch (err) {
        alert(err.message);
        e.target.checked = !active;
      } finally {
        e.target.disabled = false;
      }
    });

    row.querySelector('.edit-btn').addEventListener('click', () => openEditPanel(productsById[id]));

    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this product? This cannot be undone.')) return;
      try {
        await api(`/products/${id}`, { method: 'DELETE' });
        row.remove();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function resetPanelFields() {
  pendingUploads = {};
  document.getElementById('edit-id').value = '';
  document.getElementById('edit-slug').value = '';
  document.getElementById('edit-name').value = '';
  document.getElementById('edit-price').value = '';
  document.getElementById('edit-priceOld').value = '';
  document.getElementById('edit-stock').value = 100;
  document.getElementById('edit-category').value = 'UNISEX';
  document.getElementById('edit-active').checked = true;
  TEXT_FIELDS.filter((f) => f !== 'name').forEach((field) => {
    document.getElementById('edit-' + field).value = '';
  });
  IMAGE_FIELDS.forEach((field) => {
    const img = document.getElementById('preview-' + field);
    img.src = '';
    img.style.visibility = 'hidden';
    document.querySelector(`input[type="file"][data-target="${field}"]`).value = '';
  });
  document.getElementById('edit-error').style.display = 'none';
  document.getElementById('edit-success').style.display = 'none';
}

function openCreatePanel() {
  currentMode = 'create';
  currentId = null;
  resetPanelFields();
  document.getElementById('edit-panel-title').textContent = 'Add product';
  document.getElementById('edit-slug').disabled = false;
  document.getElementById('save-btn').textContent = 'Create product';
  const panel = document.getElementById('edit-panel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openEditPanel(p) {
  currentMode = 'edit';
  currentId = p.id;
  pendingUploads = {};
  document.getElementById('edit-panel-title').textContent = `Edit — ${p.name}`;
  document.getElementById('edit-id').value = p.id;
  document.getElementById('edit-slug').value = p.slug;
  document.getElementById('edit-slug').disabled = true;
  document.getElementById('edit-name').value = p.name || '';
  document.getElementById('edit-price').value = p.price;
  document.getElementById('edit-priceOld').value = p.priceOld != null ? p.priceOld : '';
  document.getElementById('edit-stock').value = p.stock;
  document.getElementById('edit-category').value = p.category || 'UNISEX';
  document.getElementById('edit-active').checked = !!p.active;
  document.getElementById('edit-tagline').value = p.tagline || '';
  document.getElementById('edit-inspiredBy').value = p.inspiredBy || '';
  document.getElementById('edit-topNote').value = p.topNote || '';
  document.getElementById('edit-heartNote').value = p.heartNote || '';
  document.getElementById('edit-baseNote').value = p.baseNote || '';
  document.getElementById('edit-description').value = p.description || '';
  document.getElementById('edit-editorialLine').value = p.editorialLine || '';
  document.getElementById('edit-editorialStory').value = p.editorialStory || '';
  document.getElementById('save-btn').textContent = 'Save changes';

  IMAGE_FIELDS.forEach((field) => {
    const img = document.getElementById('preview-' + field);
    img.src = p[field] || '';
    img.style.visibility = p[field] ? 'visible' : 'hidden';
    document.querySelector(`input[type="file"][data-target="${field}"]`).value = '';
  });

  document.getElementById('edit-error').style.display = 'none';
  document.getElementById('edit-success').style.display = 'none';
  const panel = document.getElementById('edit-panel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('add-new-btn').addEventListener('click', openCreatePanel);

document.querySelectorAll('input[type="file"][data-target]').forEach((input) => {
  input.addEventListener('change', () => {
    const field = input.getAttribute('data-target');
    const file = input.files[0];
    if (!file) return;
    pendingUploads[field] = file;
    const img = document.getElementById('preview-' + field);
    img.src = URL.createObjectURL(file);
    img.style.visibility = 'visible';
  });
});

document.getElementById('cancel-edit').addEventListener('click', () => {
  document.getElementById('edit-panel').style.display = 'none';
  pendingUploads = {};
  currentMode = null;
});

document.getElementById('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('edit-error');
  const successEl = document.getElementById('edit-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const payload = {
      name: document.getElementById('edit-name').value.trim(),
      price: Number(document.getElementById('edit-price').value),
      stock: Number(document.getElementById('edit-stock').value),
      active: document.getElementById('edit-active').checked,
      category: document.getElementById('edit-category').value,
    };
    const priceOldRaw = document.getElementById('edit-priceOld').value;
    payload.priceOld = priceOldRaw === '' ? null : Number(priceOldRaw);

    TEXT_FIELDS.filter((f) => f !== 'name').forEach((field) => {
      payload[field] = document.getElementById('edit-' + field).value;
    });

    const uploadEntries = Object.entries(pendingUploads);
    if (uploadEntries.length) {
      const urls = await Promise.all(uploadEntries.map(([, file]) => uploadImage(file)));
      uploadEntries.forEach(([field], i) => { payload[field] = urls[i]; });
    }

    if (currentMode === 'create') {
      payload.slug = document.getElementById('edit-slug').value.trim();
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
      pendingUploads = {};
      await loadProducts();
      document.getElementById('edit-panel').style.display = 'none';
    } else {
      await api(`/products/${currentId}`, { method: 'PUT', body: JSON.stringify(payload) });
      pendingUploads = {};
      successEl.textContent = 'Saved.';
      successEl.style.display = 'block';
      await loadProducts();
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = currentMode === 'create' ? 'Create product' : 'Save changes';
  }
});

mountSidebar('products');
requireAuthAndWireLogout().then(loadProducts).catch(() => {});
