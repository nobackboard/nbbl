# NBBL Landing

Static marketing site for **No Backboard Basketball League** (NBBL): hero, game rules, ecosystem carousel, tech videos, social embeds, and contact form.

## Recent changes

- **NBBL PlayCenter demo banner (The Tech):** Below the second YouTube embed in **The Tech** section, a call-to-action links to the interactive demo at [https://nbbl-playcenter.vercel.app/](https://nbbl-playcenter.vercel.app/). The link opens in the **same tab** (no `target="_blank"`). Styling matches the site (orange accent `#FF5F1F`, glass-style card, focus ring for keyboard users).

## Tech stack

- Single-page **`index.html`** with [Tailwind CSS](https://tailwindcss.com/) via CDN
- Deployed on [Vercel](https://vercel.com/)
- **`api/contact.js`** — serverless handler using [Resend](https://resend.com/) for the “Stay in Touch” form

## Local preview

Open `index.html` in a browser, or serve the folder:

```bash
npx --yes serve .
```

Then open the URL shown (often `http://localhost:3000`).

## Environment variables

Copy `.env.example` to `.env.local` for local/Vercel dev. Set the same variables in Vercel → Project → Settings → Environment Variables.

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key for sending email |
| `RESEND_FROM_EMAIL` | Verified sender (format: `Name <email@domain>`) |
| `CONTACT_TO_EMAIL` | Optional comma-separated recipient list |

Never commit real secrets; `.env.local` should stay untracked.

## Repository layout

- `index.html` — main site
- `api/contact.js` — contact form API route
- `AGENTS.md` — notes for AI/human contributors (Vercel practices)
