# NBBL Landing

Static marketing site for **No Backboard Basketball League** (NBBL): hero, game rules, ecosystem carousel, tech videos, social embeds, and **Join the Movement** contact form.

## Tech stack

- Single-page **`index.html`** with [Tailwind CSS](https://tailwindcss.com/) **built for production** (see [Styling](#styling))
- Deployed on [Vercel](https://vercel.com/)
- **`api/contact.js`** — serverless handler: [Resend](https://resend.com/) for email notifications, optional [Constant Contact](https://www.constantcontact.com/) V3 API for CRM list signup

## Styling

Tailwind is **not** loaded from `cdn.tailwindcss.com` in production. The site uses a prebuilt stylesheet:

| Path | Role |
|------|------|
| `styles/tailwind.source.css` | `@tailwind` entry |
| `tailwind.config.js` | `content: ['./index.html']` for purging |
| `tw.css` | Minified output (referenced by `index.html`) |

After changing Tailwind utility classes in `index.html`, regenerate CSS:

```bash
npm install
npm run build:css
```

Vercel runs **`npm run build`** on deploy, which runs `build:css`, so `tw.css` stays current in production.

## Contact form and CRM

The form in **`#stay-in-touch`** posts JSON to **`/api/contact`** (`name`, `email`, optional `message`). Flow:

1. **Resend** — Sends a plaintext email to your team (`CONTACT_TO_EMAIL` or built-in defaults), with visitor email as `replyTo`.
2. **Constant Contact** (optional) — If all CC env vars below are set, the handler calls **`POST /v3/contacts/sign_up_form`** so the address is created or updated and added to your list(s). CRM failures are logged in Vercel; the visitor still sees success if email sent.

OAuth setup (one-time): [Constant Contact Authorization Code Flow](https://v3.developer.constantcontact.com/api_guide/server_flow.html). Use scopes including **`contact_data`** and **`offline_access`**, then store the **refresh token** in `CONSTANT_CONTACT_REFRESH_TOKEN`.

List IDs are UUIDs from **`GET https://api.cc.email/v3/contact_lists`** (`list_id` on each list).

## Environment variables

Copy `.env.example` to **`.env.local`** for `vercel dev`. Set the same keys in **Vercel → Project → Settings → Environment Variables** for production.

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Verified sender (`Name <email@domain>`) |
| `CONTACT_TO_EMAIL` | Optional comma-separated internal recipients |
| `CONSTANT_CONTACT_CLIENT_ID` | OAuth client ID (API key) |
| `CONSTANT_CONTACT_CLIENT_SECRET` | OAuth client secret |
| `CONSTANT_CONTACT_REFRESH_TOKEN` | OAuth refresh token (`contact_data` + `offline_access`) |
| `CONSTANT_CONTACT_LIST_ID` | Single list UUID |
| `CONSTANT_CONTACT_LIST_IDS` | Optional comma-separated list UUIDs (overrides single ID if you prefer many) |

Never commit real secrets. **`.env.local`** is gitignored.

Optional local-only placeholders (not read by the app; for copy/paste tests):

| Variable | Purpose |
|----------|---------|
| `CONTACT_TEST_NAME` | Sample name for manual `/api/contact` tests |
| `CONTACT_TEST_EMAIL` | Sample email for manual tests |

## Local development

**Static HTML only** (no API):

```bash
npx --yes serve .
```

**Full stack** (contact API + env from `.env.local`):

```bash
npm install
npm run build:css
npx --yes vercel dev
```

Then open the URL shown (often `http://localhost:3000`).

## Repository layout

- `index.html` — main site
- `tw.css` — generated Tailwind (rebuild after class changes)
- `api/contact.js` — contact form API route
- `styles/tailwind.source.css` — Tailwind source
- `tailwind.config.js` — Tailwind config
- `.env.example` — documented env vars
- `AGENTS.md` — notes for AI/human contributors (Vercel practices)

## Recent changes

- **Constant Contact:** Optional sync of signups to a contact list via V3 `sign_up_form` after Resend succeeds.
- **Tailwind production build:** Replaced Play CDN with CLI-built **`tw.css`** and `npm run build` / `build:css` for Vercel.
- **Brand accent (site-wide):** Primary accent **`#E70910`** (logo red); yellow CTAs **`#FFE500`** with black text.
- **NBBL PlayCenter demo (The Tech):** CTA card with `id="playcenter-demo"` linking to [nbbl-playcenter.vercel.app](https://nbbl-playcenter.vercel.app/) (same tab); nav/footer use **Try the demo** where applicable.
- **Join the Movement:** Contact block id **`#stay-in-touch`**; form submits to **`/api/contact`**.
