const { Resend } = require('resend');

const CC_TOKEN_URL = 'https://authz.constantcontact.com/oauth2/default/v1/token';
const CC_SIGN_UP_URL = 'https://api.cc.email/v3/contacts/sign_up_form';

/** In-process cache so we do not refresh the access token on every request. */
let ccTokenCache = { accessToken: null, expiresAtMs: 0 };

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

function splitDisplayName(name) {
  const t = String(name || '').trim();
  if (!t) return { first_name: '', last_name: '' };
  const i = t.indexOf(' ');
  if (i === -1) return { first_name: t.slice(0, 50), last_name: '' };
  return {
    first_name: t.slice(0, i).slice(0, 50),
    last_name: t.slice(i + 1).trim().slice(0, 50),
  };
}

function parseConstantContactListIds() {
  const raw =
    process.env.CONSTANT_CONTACT_LIST_IDS ||
    process.env.CONSTANT_CONTACT_LIST_ID ||
    '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isConstantContactConfigured() {
  return Boolean(
    process.env.CONSTANT_CONTACT_CLIENT_ID &&
      process.env.CONSTANT_CONTACT_CLIENT_SECRET &&
      process.env.CONSTANT_CONTACT_REFRESH_TOKEN &&
      parseConstantContactListIds().length > 0
  );
}

async function getConstantContactAccessToken() {
  const clientId = process.env.CONSTANT_CONTACT_CLIENT_ID;
  const clientSecret = process.env.CONSTANT_CONTACT_CLIENT_SECRET;
  const refreshToken = process.env.CONSTANT_CONTACT_REFRESH_TOKEN;

  const now = Date.now();
  if (
    ccTokenCache.accessToken &&
    now < ccTokenCache.expiresAtMs - 60_000
  ) {
    return ccTokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(CC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    const msg =
      (tokenJson && (tokenJson.error_description || tokenJson.error)) ||
      `Token request failed (${tokenRes.status})`;
    throw new Error(msg);
  }

  const accessToken = tokenJson.access_token;
  const expiresInSec = Number(tokenJson.expires_in) || 7200;
  if (!accessToken) {
    throw new Error('Constant Contact token response missing access_token.');
  }

  ccTokenCache = {
    accessToken,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return accessToken;
}

/**
 * Adds or updates the contact in Constant Contact (same email = update).
 * Requires list_memberships per API. Message is not sent to CC (only the notification email).
 */
async function syncConstantContactContact({ name, email }) {
  const listMemberships = parseConstantContactListIds();
  if (!listMemberships.length) return;

  const accessToken = await getConstantContactAccessToken();
  const { first_name, last_name } = splitDisplayName(name);

  const payload = {
    email_address: email,
    list_memberships: listMemberships,
    ...(first_name ? { first_name } : {}),
    ...(last_name ? { last_name } : {}),
  };

  const ccRes = await fetch(CC_SIGN_UP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const ccJson = await ccRes.json().catch(() => ({}));
  if (!ccRes.ok) {
    const msg =
      (Array.isArray(ccJson.errors) &&
        ccJson.errors[0] &&
        (ccJson.errors[0].error_message || ccJson.errors[0].error_key)) ||
      ccJson.detail ||
      ccJson.title ||
      `Constant Contact sign_up_form failed (${ccRes.status})`;
    throw new Error(msg);
  }
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

    if (isConstantContactConfigured()) {
      try {
        await syncConstantContactContact({ name, email });
      } catch (ccErr) {
        console.error(
          '[contact] Constant Contact sync failed:',
          ccErr && ccErr.message ? ccErr.message : ccErr
        );
      }
    }

    return res.status(200).json({ ok: true, id: data && data.id });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Failed to send email.',
    });
  }
};
