// Meta Conversions API (server-side event tracking) — mirrors the client-side
// Pixel so ad-blocked/lost browser events still reach Meta, and de-dupes
// against the Pixel by reusing the same event_id for the same logical event
// (see https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events).
const crypto = require('crypto');

const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || undefined;
const GRAPH_VERSION = 'v21.0';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

// Builds the user_data block Meta expects — PII (email/phone) is hashed
// per their spec; fbp/fbc come from the Pixel's own first-party cookies so
// CAPI events can be matched to the same visitor/browser as Pixel events.
function buildUserData(req, { email, phone } = {}) {
  const cookieHeader = req.headers.cookie;
  const userData = {
    client_ip_address: req.ip,
    client_user_agent: req.headers['user-agent'],
  };
  const fbp = parseCookie(cookieHeader, '_fbp');
  const fbc = parseCookie(cookieHeader, '_fbc');
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (email) userData.em = [sha256(email)];
  if (phone) userData.ph = [sha256(phone.replace(/\D/g, ''))];
  return userData;
}

// Sends one event to the Conversions API. Never throws — a tracking failure
// should never break the request it's attached to (e.g. order creation).
// No-ops (with a log line) when META_CAPI_ACCESS_TOKEN isn't configured, so
// local/dev environments work without one.
async function sendMetaEvent({ eventName, eventId, req, customerData, customData, eventSourceUrl }) {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.log(`[meta-capi] not configured, skipping ${eventName} (${eventId})`);
    return;
  }
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: eventSourceUrl,
      user_data: buildUserData(req, customerData),
      custom_data: customData,
    }],
  };
  if (TEST_EVENT_CODE) payload.test_event_code = TEST_EVENT_CODE;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.error(`[meta-capi] ${eventName} rejected:`, JSON.stringify(data));
    else console.log(`[meta-capi] sent ${eventName} (${eventId})`);
  } catch (err) {
    console.error(`[meta-capi] ${eventName} request failed:`, err.message);
  }
}

module.exports = { sendMetaEvent };
