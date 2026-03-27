const { Resend } = require('resend');

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

    return res.status(200).json({ ok: true, id: data && data.id });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Failed to send email.',
    });
  }
};
