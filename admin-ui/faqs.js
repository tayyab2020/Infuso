let faqsById = {};

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function renderFaqRow(f) {
  return `
    <tr data-id="${f.id}">
      <td>${f.order}</td>
      <td>${escapeHtml(f.question)}</td>
      <td class="hint">${escapeHtml(truncate(f.answer, 80))}</td>
      <td><input type="checkbox" class="active-input" ${f.active ? 'checked' : ''} style="width:auto;" /></td>
      <td class="btn-row">
        <button class="btn secondary edit-btn" type="button">Edit</button>
        <button class="btn danger delete-btn" type="button">Delete</button>
      </td>
    </tr>
  `;
}

async function loadFaqs() {
  const body = document.getElementById('faqs-body');
  const faqs = await api('/faqs');
  faqsById = Object.fromEntries(faqs.map((f) => [f.id, f]));

  body.innerHTML = faqs.length
    ? faqs.map(renderFaqRow).join('')
    : '<tr><td colspan="5" class="hint">No FAQs yet.</td></tr>';

  body.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');

    row.querySelector('.active-input').addEventListener('change', async (e) => {
      const active = e.target.checked;
      e.target.disabled = true;
      try {
        await api(`/faqs/${id}`, { method: 'PUT', body: JSON.stringify({ active }) });
      } catch (err) {
        alert(err.message);
        e.target.checked = !active;
      } finally {
        e.target.disabled = false;
      }
    });

    row.querySelector('.edit-btn').addEventListener('click', () => openEditPanel(faqsById[id]));

    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this FAQ?')) return;
      try {
        await api(`/faqs/${id}`, { method: 'DELETE' });
        row.remove();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function openEditPanel(f) {
  document.getElementById('edit-panel-title').textContent = 'Edit FAQ';
  document.getElementById('edit-id').value = f.id;
  document.getElementById('edit-question').value = f.question;
  document.getElementById('edit-answer').value = f.answer;
  document.getElementById('edit-order').value = f.order;
  document.getElementById('edit-active').checked = !!f.active;
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
    await api(`/faqs/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        question: document.getElementById('edit-question').value.trim(),
        answer: document.getElementById('edit-answer').value.trim(),
        order: Number(document.getElementById('edit-order').value || 0),
        active: document.getElementById('edit-active').checked,
      }),
    });
    document.getElementById('edit-panel').style.display = 'none';
    await loadFaqs();
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
    await api('/faqs', {
      method: 'POST',
      body: JSON.stringify({
        question: document.getElementById('new-question').value.trim(),
        answer: document.getElementById('new-answer').value.trim(),
        order: Number(document.getElementById('new-order').value || 0),
      }),
    });
    document.getElementById('add-form').reset();
    await loadFaqs();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

mountSidebar('faqs');
requireAuthAndWireLogout().then(loadFaqs).catch(() => {});
