// nbbl-site Worker: static assets (ASSETS binding) + /api/contact port of nobackboard/nbbl api/contact.js
const HUBSPOT_DEFAULT_PORTAL_ID = '247117755';
const HUBSPOT_DEFAULT_FORM_GUID = 'e51254fe-9f3f-4de3-93b9-875abb686ba7';
const DEFAULT_TO = ['helpkeepmymoney@gmail.com', 'marknobackboard@gmail.com'];
const DEFAULT_FROM = 'NBBL Website <contact@thecpi.network>';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Strict-Transport-Security': 'max-age=63072000',
    },
  });
}

function getCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return '';
  const match = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  if (!match) return '';
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return '';
  }
}

const HUBSPOT_PAGE_NAME = 'NBBL | NBBL Showcase Gym — Gilbert, Arizona';

/**
 * Submits Join the Movement data to HubSpot's PUBLIC (unauthenticated) Forms endpoint.
 * No Authorization header: the NBBL private app token lacks the `forms` scope (403),
 * so the forms submit uses no token. HUBSPOT_PRIVATE_APP_TOKEN (optional) is used only by
 * syncHubSpotMessage below for the CRM message/note write.
 */
async function syncHubSpotForm(env, request, { name, email, message, hutk }) {
  const portalId = env.HUBSPOT_PORTAL_ID || HUBSPOT_DEFAULT_PORTAL_ID;
  const formGuid = env.HUBSPOT_FORM_GUID || HUBSPOT_DEFAULT_FORM_GUID;
  const url = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formGuid}`;
  const fullName = String(name || '').trim().slice(0, 100);
  const fields = [
    ...(fullName ? [{ name: 'firstname', value: fullName }] : []),
    { name: 'email', value: email },
    ...(message ? [{ name: 'message', value: message }] : []),
  ];
  const referer = request.headers.get('referer') || '';
  let pageUri = '';
  try {
    pageUri = referer ? new URL(referer).toString() : new URL('/', request.url).toString();
  } catch {
    pageUri = new URL('/', request.url).toString();
  }
  const context = { pageUri, pageName: HUBSPOT_PAGE_NAME };
  if (hutk) context.hutk = hutk;
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) context.ipAddress = ip;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, context }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[contact] HubSpot Forms API response:', res.status, JSON.stringify(body));
    throw new Error(body.message || body.error || `HubSpot form submission failed (${res.status})`);
  }
  return body;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Writes the visitor's message onto the contact via the CRM API (private app token,
 * contacts read/write). The collected form e51254fe can't carry `message`, so this
 * runs after the public forms submit. Sets ONLY `message` (never firstname), then adds
 * a Note (scope: crm.objects.contacts.write) associated to the contact so history
 * isn't overwritten. Returns 'ok' | 'failed' | 'skipped'. Never throws.
 */
async function syncHubSpotMessage(env, { name, email, message }) {
  const token = env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!message || !token) return 'skipped';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const up = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: [{ idProperty: 'email', id: email, properties: { message: message.slice(0, 65000) } }] }),
    });
    const upBody = await up.json().catch(() => ({}));
    if (!up.ok) {
      console.error('[contact] HubSpot message upsert failed:', up.status, JSON.stringify(upBody).slice(0, 500));
      return 'failed';
    }
    const contactId = upBody && upBody.results && upBody.results[0] && upBody.results[0].id;
    if (contactId) {
      const noteBody = `<p><strong>Website contact form (nobackboard.com)</strong></p><p>Name: ${escapeHtml(name)}<br>Email: ${escapeHtml(email)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
      const nr = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          properties: { hs_timestamp: new Date().toISOString(), hs_note_body: noteBody },
          associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }],
        }),
      });
      if (!nr.ok) {
        const nb = await nr.json().catch(() => ({}));
        console.error('[contact] HubSpot note create failed (message property still saved):', nr.status, JSON.stringify(nb).slice(0, 500));
      }
    }
    return 'ok';
  } catch (err) {
    console.error('[contact] HubSpot message sync error:', err && err.message ? err.message : err);
    return 'failed';
  }
}

async function handleContact(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS,
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Strict-Transport-Security': 'max-age=63072000',
      },
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!body || typeof body !== 'object') body = {};

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  const honeypot = String(body._gotcha || '').trim();
  const hutk = getCookie(request, 'hubspotutk');

  if (honeypot) return json({ ok: true });
  if (!name || !email) return json({ error: 'Name and email are required.' }, 400);
  if (!env.RESEND_API_KEY) return json({ error: 'Email service is not configured.' }, 500);

  const parsedTo = env.CONTACT_TO_EMAIL
    ? env.CONTACT_TO_EMAIL.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const to = parsedTo.length > 0 ? parsedTo : DEFAULT_TO;
  const text = [`Name: ${name}`, `Email: ${email}`, '', 'Message:', message || '(none)'].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL || DEFAULT_FROM,
        to,
        reply_to: email,
        subject: `NBBL Stay in Touch — ${name}`,
        text,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: data.message || 'Failed to send email.' }, 500);

    let hubspotSync = 'failed';
    try {
      await syncHubSpotForm(env, request, { name, email, message, hutk });
      hubspotSync = 'ok';
    } catch (err) {
      console.error('[contact] HubSpot sync failed:', err && err.message ? err.message : err);
    }
    const hubspotMessage = await syncHubSpotMessage(env, { name, email, message });
    return json({ ok: true, id: data && data.id, hubspotSync, hubspotMessage });
  } catch (err) {
    return json({ error: (err && err.message) || 'Failed to send email.' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return handleContact(request, env);
    // html_handling is "none" (exact Vercel parity for /index.html and the verification file),
    // so serve "/" from /index.html here.
    if (url.pathname === '/') {
      const r = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
      const h = new Headers(r.headers);
      h.set('Content-Type', 'text/html; charset=utf-8');
      h.set('Cache-Control', 'public, max-age=0, must-revalidate');
      h.set('Strict-Transport-Security', 'max-age=63072000');
      h.set('Access-Control-Allow-Origin', '*');
      return new Response(r.body, { status: r.status, headers: h });
    }
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;
    // Parity with Vercel's 404 (plain text, same HSTS/cache headers)
    return new Response('The page could not be found\n\nNOT_FOUND\n', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Strict-Transport-Security': 'max-age=63072000',
      },
    });
  },
};
