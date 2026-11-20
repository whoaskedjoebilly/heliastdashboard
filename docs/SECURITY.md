# Security notes

## What the code enforces
- Security headers on every response (CSP, HSTS, frame denial, nosniff, referrer and permissions policies) — see `next.config.ts`.
- OAuth `state` is HMAC-signed with a 15-minute expiry, so the public callback routes can't be used to attach someone else's account to a client.
- Admin secrets are compared in constant time. The cron route and `shopify-token` accept the admin token **only in the `x-admin-token` header**, never in a URL.
- `/api/assistant/chat` validates input size, rate-limits per IP/user (tighter for the unauthenticated demo), and never returns provider error text.
- The `track` edge function validates every field and caps rows per client.

## Do these outside the code
1. Vercel → Firewall: add a rate-limit rule for `/api/assistant/chat` (e.g. 20 req/min/IP). The in-code limiter is per-instance only.
2. Rotate `ADMIN_ACCESS_TOKEN`, `CRON_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` if they were ever pasted in a URL, chat, or screenshot.
3. Turn on 2FA for GitHub, Vercel, Supabase, Namecheap, Google, Meta and Shopify.
4. Supabase → Auth → enable leaked-password protection, set a minimum password length of 12.
5. Keep Dependabot / `npm audit` running; this repo is public, so never commit `.env*` files.
