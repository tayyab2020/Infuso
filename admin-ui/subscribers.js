function renderSubscriberRow(s) {
  const date = new Date(s.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
  return `
    <tr data-id="${s.id}">
      <td>${escapeHtml(s.email)}</td>
      <td class="hint">${date}</td>
      <td class="btn-row">
        <button class="btn danger delete-btn" type="button">Delete</button>
      </td>
    </tr>
  `;
}

async function loadSubscribers() {
  const body = document.getElementById('subscribers-body');
  const subscribers = await api('/subscribers');

  body.innerHTML = subscribers.length
    ? subscribers.map(renderSubscriberRow).join('')
    : '<tr><td colspan="3" class="hint">No subscribers yet.</td></tr>';

  body.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');
    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Remove this subscriber?')) return;
      try {
        await api(`/subscribers/${id}`, { method: 'DELETE' });
        row.remove();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

mountSidebar('subscribers');
requireAuthAndWireLogout().then(loadSubscribers).catch(() => {});
