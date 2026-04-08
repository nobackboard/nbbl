# NBBL Landing

Static marketing site for **No Backboard Basketball League** (NBBL): hero, game rules, ecosystem carousel, tech videos, social embeds, and contact form.

## Recent changes

- **Brand accent (site-wide):** Primary accent color is **logo red `#E70910`** (rgb(231, 9, 16)), sampled from the red in `logo.png`. It replaced the previous orange `#FF5F1F` on links, buttons, borders, focus rings, and highlights. Form focus on “Stay in Touch” uses `rgba(231, 9, 16, 0.25)` for the glow.
- **NBBL PlayCenter demo banner (The Tech):** Between the two YouTube embeds in **The Tech** section, a call-to-action card links to the interactive demo at [https://nbbl-playcenter.vercel.app/](https://nbbl-playcenter.vercel.app/) in the **same tab** (no `target="_blank"`). The card has **`id="playcenter-demo"`** and **`scroll-mt-24`** so in-page anchors clear the fixed nav.
- **Demo copy:** Headline is **NBBL Allnet (PlayCenter Demo)** (parenthetical uses the accent color). Body copy includes a line inviting users to preview how the PlayCenter app will feel, then the **No Backboard. All Net.** tagline.
- **“Try the demo” navigation:** The header, footer, and demo card pill all use **Try the demo** / **Try the Demo** and link to [https://nbbl-playcenter.vercel.app/](https://nbbl-playcenter.vercel.app/) in the **same tab**. The demo card block still has **`id="playcenter-demo"`** for optional deep links (`#playcenter-demo`). Yellow CTAs use **`#FFE500`** (logo yellow) with black text; primary actions such as **Join The Movement** stay on the red accent.

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
