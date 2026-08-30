const { Resend } = require('resend');

const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || '247117755';
const HUBSPOT_FORM_GUID =
  process.env.HUBSPOT_FORM_GUID || 'e51254fe-9f3f-4de3-93b9-875abb686ba7';
const HUBSPOT_PRIVATE_APP_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN || '';
const HUBSPOT_SUBMIT_URL = HUBSPOT_PRIVATE_APP_TOKEN
  ? `https://api.hsforms.com/submissions/v3/integration/secure/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_FORM_GUID}`
  : `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_FORM_GUID}`;

const DEFAULT_TO = [
  'helpkeepmymoney@gmail.com',
  'marknobackboard@gmail.com',
];

const parsedTo = process.env.CONTACT_TO_EMAIL
  ? process.env.CONTACT_TO_EMAIL.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const TO_EMAILS = parsedTo.length > 0 ? parsedTo : DEFAULT_TO;

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'NBBL Website <contact@thecpi.network>';

function getCookie(req, name) {
  const cookieHeader = req.headers && req.headers.cookie;
  if (!cookieHeader) return '';

  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!match) return '';
  return decodeURIComponent(match.slice(name.length + 1));
}

/**
 * Submits the Join the Movement payload to HubSpot's captured form.
 *
 * The existing HubSpot contact property `message` is intentionally used for
 * the visitor's optional message. When a private app token is configured,
 * the authenticated Forms API allows CRM properties that are not currently
 * declared on the captured form definition.
 */
async function syncHubSpotForm({ name, email, message, hutk }) {
  const fullName = String(name || '').trim().slice(0, 100);
  const fields = [
    ...(fullName ? [{ name: 'firstname', value: fullName }] : []),
    { name: 'email', value: email },
    ...(message ? [{ name: 'message', value: message }] : []),
  ];

  const payload = { fields };

  if (hutk) {
    payload.context = { hutk };
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (HUBSPOT_PRIVATE_APP_TOKEN) {
    headers.Authorization = `Bearer ${HUBSPOT_PRIVATE_APP_TOKEN}`;
  }

  const hubspotRes = await fetch(HUBSPOT_SUBMIT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const hubspotJson = await hubspotRes.json().catch(() => ({}));

  if (!hubspotRes.ok) {
    console.error(
      '[contact] HubSpot Forms API response:',
      hubspotRes.status,
      JSON.stringify(hubspotJson)
    );
    const msg =
      hubspotJson.message ||
      hubspotJson.error ||
      `HubSpot form submission failed (${hubspotRes.status})`;
    throw new Error(msg);
  }

  return hubspotJson;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      body = typeof body === 'string' ? JSON.parse(body) : {};
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  const honeypot = String(body._gotcha || '').trim();
  const hutk = getCookie(req, 'hubspotutk');

  if (honeypot) {
    return res.status(200).json({ ok: true });
  }

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service is not configured.' });
  }

  const resend = new Resend(apiKey);

  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    '',
    'Message:',
    message || '(none)',
  ].join('\n');

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAILS,
      replyTo: email,
      subject: `NBBL Stay in Touch — ${name}`,
      text,
    });

    if (error) {
      return res.status(500).json({ error: error.message || 'Failed to send email.' });
    }

    let hubspotSync = 'failed';
    try {
      await syncHubSpotForm({ name, email, message, hutk });
      hubspotSync = 'ok';
    } catch (hubspotErr) {
      console.error(
        '[contact] HubSpot sync failed:',
        hubspotErr && hubspotErr.message ? hubspotErr.message : hubspotErr
      );
    }

    return res.status(200).json({
      ok: true,
      id: data && data.id,
      hubspotSync,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Failed to send email.',
    });
  }
};
