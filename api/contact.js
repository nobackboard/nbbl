const { Resend } = require('resend');

const CC_TOKEN_URL = 'https://authz.constantcontact.com/oauth2/default/v1/token';
const CC_SIGN_UP_URL = 'https://api.cc.email/v3/contacts/sign_up_form';

const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || '247117755';
const HUBSPOT_FORM_GUID =
  process.env.HUBSPOT_FORM_GUID || 'e51254fe-9f3f-4de3-93b9-875abb686ba7';
const HUBSPOT_SUBMIT_URL = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_FORM_GUID}`;

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

function ccEnv(name) {
  const v = process.env[name];
  return v == null ? '' : String(v).trim();
}

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
    ccEnv('CONSTANT_CONTACT_LIST_IDS') || ccEnv('CONSTANT_CONTACT_LIST_ID');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isConstantContactConfigured() {
  return Boolean(
    ccEnv('CONSTANT_CONTACT_CLIENT_ID') &&
      ccEnv('CONSTANT_CONTACT_CLIENT_SECRET') &&
      ccEnv('CONSTANT_CONTACT_REFRESH_TOKEN') &&
      parseConstantContactListIds().length > 0
  );
}

function isConstantContactPartiallyConfigured() {
  const keys = [
    'CONSTANT_CONTACT_CLIENT_ID',
    'CONSTANT_CONTACT_CLIENT_SECRET',
    'CONSTANT_CONTACT_REFRESH_TOKEN',
    'CONSTANT_CONTACT_LIST_ID',
    'CONSTANT_CONTACT_LIST_IDS',
  ];
  const any = keys.some((k) => Boolean(ccEnv(k)));
  return any && !isConstantContactConfigured();
}

async function getConstantContactAccessToken() {
  const clientId = ccEnv('CONSTANT_CONTACT_CLIENT_ID');
  const clientSecret = ccEnv('CONSTANT_CONTACT_CLIENT_SECRET');
  const refreshToken = ccEnv('CONSTANT_CONTACT_REFRESH_TOKEN');

  const now = Date.now();
  if (
    ccTokenCache.accessToken &&
    now < ccTokenCache.expiresAtMs - 60_000
  ) {
    return ccTokenCache.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString(
    'base64'
  );
  const bodyBasic = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const bodyForm = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  let tokenRes = await fetch(CC_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
    },
    body: bodyBasic.toString(),
  });

  let tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    console.error(
      '[contact] CC token (Basic auth) failed:',
      tokenRes.status,
      JSON.stringify(tokenJson)
    );
    if (tokenJson.error === 'invalid_grant') {
      throw new Error(
        'Constant Contact refresh token is invalid or expired. Run the OAuth authorization code flow again, copy the new refresh token, and update CONSTANT_CONTACT_REFRESH_TOKEN in Vercel (Production).'
      );
    }
    tokenRes = await fetch(CC_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: bodyForm.toString(),
    });
    tokenJson = await tokenRes.json().catch(() => ({}));
  }
  if (!tokenRes.ok) {
    console.error(
      '[contact] CC token (form client_secret) failed:',
      tokenRes.status,
      JSON.stringify(tokenJson)
    );
    if (tokenRes.status === 429) {
      throw new Error(
        'Constant Contact temporarily rate-limited token requests. Wait a few minutes and try again; avoid double token calls after a failed token refresh.'
      );
    }
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
 * Submits the Join the Movement payload to HubSpot's captured form.
 * HubSpot contact names use the standard firstname and lastname fields.
 * The website collects one full-name field, so split it before submission.
 */
async function syncHubSpotForm({ name, email, message }) {
  const { first_name, last_name } = splitDisplayName(name);
  const payload = {
    fields: [
      ...(first_name ? [{ name: 'firstname', value: first_name }] : []),
      ...(last_name ? [{ name: 'lastname', value: last_name }] : []),
      { name: 'email', value: email },
      ...(message ? [{ name: 'message', value: message }] : []),
    ],
  };

  const hubspotRes = await fetch(HUBSPOT_SUBMIT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
    console.error(
      '[contact] Constant Contact API response:',
      ccRes.status,
      JSON.stringify(ccJson)
    );
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

    let hubspotSync = 'failed';
    try {
      await syncHubSpotForm({ name, email, message });
      hubspotSync = 'ok';
    } catch (hubspotErr) {
      console.error(
        '[contact] HubSpot sync failed:',
        hubspotErr && hubspotErr.message ? hubspotErr.message : hubspotErr
      );
    }

    let ccSync = 'off';
    if (isConstantContactConfigured()) {
      ccSync = 'failed';
      try {
        await syncConstantContactContact({ name, email });
        ccSync = 'ok';
      } catch (ccErr) {
        console.error(
          '[contact] Constant Contact sync failed:',
          ccErr && ccErr.message ? ccErr.message : ccErr
        );
      }
    } else if (isConstantContactPartiallyConfigured()) {
      console.warn(
        '[contact] Constant Contact env is incomplete; CRM sync is disabled. Set CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, and LIST_ID (or LIST_IDS) on this deployment.'
      );
    }

    return res.status(200).json({
      ok: true,
      id: data && data.id,
      ccSync,
      hubspotSync,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Failed to send email.',
    });
  }
};
