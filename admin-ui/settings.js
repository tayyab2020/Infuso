function toDateTimeLocalValue(d) {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const SETTINGS_TEXT_FIELDS = [
  'facebookUrl', 'instagramUrl', 'contactEmail', 'whatsappNumber',
  'bankAccountName', 'bankName', 'bankAccountNumber', 'bankIban',
  'mailFromName', 'mailFromAddress', 'codEmailSubject', 'codEmailIntro',
  'bankEmailSubject', 'bankEmailIntro',
  'houseEyebrow', 'houseBody',
  'editorialEyebrow', 'editorialHeading', 'editorialBody',
  'discoveryEyebrow', 'discoveryHeading', 'discoveryBody',
  'faqEyebrow', 'faqHeading', 'footerCopyright',
  'deliveryInfo', 'returnPolicy',
  'campaignLabel', 'campaignPriceLabel',
];
const SETTINGS_IMAGE_FIELDS = ['logoUrl', 'bankQrImageUrl'];

let pendingUploads = {};

// ---- Campaign banner rich-text editor (Quill) ----
// A plain <textarea> can't let an admin style just one word of the banner,
// so this field is a Quill editor instead. Its rendered HTML is sent as
// campaignBannerContent and re-sanitized server-side (allowlist: p/b/strong/
// i/em/u/s/strike/span[style=color|background-color|font-weight|font-style|
// text-decoration, class=ql-font-serif|ql-font-monospace]/br) before it's
// ever shown on the public storefront — Quill's own output is trusted for
// editing convenience only, not security.
const quill = new Quill('#s-campaignBannerContent-quill', {
  theme: 'snow',
  modules: { toolbar: [['bold', 'italic', 'underline', 'strike'], [{ font: [] }], ['clean']] },
  placeholder: document.getElementById('s-campaignBannerContent-quill').getAttribute('data-placeholder') || '',
});
// The two color swatches aren't part of Quill's own toolbar (its built-in
// color picker only offers a fixed palette, not an arbitrary hex match to
// the campaign theme color) — they're plain <input type="color">s moved
// into Quill's toolbar row and applied via quill.formatText() directly.
quill.getModule('toolbar').container.appendChild(document.getElementById('rte-color-bar'));

const rteColorInput = document.getElementById('rte-color-input');
const rteColorSwatch = document.getElementById('rte-color-swatch');
const rteBgColorInput = document.getElementById('rte-bgcolor-input');
const rteBgColorSwatch = document.getElementById('rte-bgcolor-swatch');
let quillLastRange = null;
quill.on('selection-change', (range) => { if (range) quillLastRange = range; });

rteColorInput.addEventListener('input', () => {
  rteColorSwatch.style.background = rteColorInput.value;
  if (quillLastRange && quillLastRange.length > 0) {
    quill.formatText(quillLastRange.index, quillLastRange.length, 'color', rteColorInput.value, 'user');
  }
});

rteBgColorInput.addEventListener('input', () => {
  rteBgColorSwatch.style.background = rteBgColorInput.value;
  if (quillLastRange && quillLastRange.length > 0) {
    quill.formatText(quillLastRange.index, quillLastRange.length, 'background', rteBgColorInput.value, 'user');
  }
});

// <input type="color"> has no way to express "transparent" (it's opaque-only
// by spec), so removing a highlight needs its own control — passing `false`
// as the value is Quill's way of clearing a format from a range.
document.getElementById('rte-bgcolor-clear').addEventListener('mousedown', (e) => {
  e.preventDefault(); // keep the editor's selection from collapsing on click
  if (quillLastRange && quillLastRange.length > 0) {
    quill.formatText(quillLastRange.index, quillLastRange.length, 'background', false, 'user');
  }
});

async function loadSettings() {
  const s = await api('/settings');

  SETTINGS_TEXT_FIELDS.forEach((field) => {
    const el = document.getElementById('s-' + field);
    if (el) el.value = s[field] || '';
  });
  document.getElementById('s-deliveryCharge').value = s.deliveryCharge != null ? s.deliveryCharge : '';
  document.getElementById('s-lowStockThreshold').value = s.lowStockThreshold != null ? s.lowStockThreshold : '';

  document.getElementById('s-campaignActive').checked = !!s.campaignActive;
  document.getElementById('s-campaignThemeColor').value = s.campaignThemeColor || '#4ade80';
  document.getElementById('s-campaignEndsAt').value = toDateTimeLocalValue(s.campaignEndsAt);
  quill.setText(''); // clears any content left over from a previous loadSettings() call
  if (s.campaignBannerContent) quill.clipboard.dangerouslyPasteHTML(s.campaignBannerContent);
  rteColorInput.value = s.campaignThemeColor || '#4ade80';
  rteColorSwatch.style.background = rteColorInput.value;

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
    const lowStockThresholdRaw = document.getElementById('s-lowStockThreshold').value;
    payload.lowStockThreshold = lowStockThresholdRaw === '' ? null : Number(lowStockThresholdRaw);

    payload.campaignBannerContent = quill.getText().trim() ? quill.root.innerHTML : '';
    payload.campaignActive = document.getElementById('s-campaignActive').checked;
    payload.campaignThemeColor = document.getElementById('s-campaignThemeColor').value;
    const campaignEndsAtRaw = document.getElementById('s-campaignEndsAt').value;
    payload.campaignEndsAt = campaignEndsAtRaw === '' ? null : new Date(campaignEndsAtRaw).toISOString();

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
