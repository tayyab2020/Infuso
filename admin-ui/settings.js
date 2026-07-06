const SETTINGS_TEXT_FIELDS = [
  'facebookUrl', 'instagramUrl', 'contactEmail', 'whatsappNumber',
  'bankAccountName', 'bankName', 'bankAccountNumber', 'bankIban',
  'mailFromName', 'mailFromAddress', 'codEmailSubject', 'codEmailIntro',
  'bankEmailSubject', 'bankEmailIntro',
  'houseEyebrow', 'houseBody',
  'editorialEyebrow', 'editorialHeading', 'editorialBody',
  'discoveryEyebrow', 'discoveryHeading', 'discoveryBody',
  'faqEyebrow', 'faqHeading', 'footerCopyright',
];
const SETTINGS_IMAGE_FIELDS = ['logoUrl', 'bankQrImageUrl'];

let pendingUploads = {};

async function loadSettings() {
  const s = await api('/settings');

  SETTINGS_TEXT_FIELDS.forEach((field) => {
    const el = document.getElementById('s-' + field);
    if (el) el.value = s[field] || '';
  });
  document.getElementById('s-deliveryCharge').value = s.deliveryCharge != null ? s.deliveryCharge : '';

  SETTINGS_IMAGE_FIELDS.forEach((field) => {
    const img = document.getElementById('preview-' + field);
    img.src = s[field] || '';
    img.style.visibility = s[field] ? 'visible' : 'hidden';
  });
}

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

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('save-error');
  const successEl = document.getElementById('save-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const payload = {};
    SETTINGS_TEXT_FIELDS.forEach((field) => {
      payload[field] = document.getElementById('s-' + field).value;
    });
    const deliveryChargeRaw = document.getElementById('s-deliveryCharge').value;
    payload.deliveryCharge = deliveryChargeRaw === '' ? null : Number(deliveryChargeRaw);

    const uploadEntries = Object.entries(pendingUploads);
    if (uploadEntries.length) {
      const urls = await Promise.all(uploadEntries.map(([, file]) => uploadImage(file)));
      uploadEntries.forEach(([field], i) => { payload[field] = urls[i]; });
    }

    await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    pendingUploads = {};
    successEl.textContent = 'Settings saved.';
    successEl.style.display = 'block';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save settings';
  }
});

mountSidebar('settings');
requireAuthAndWireLogout().then(loadSettings).catch(() => {});
