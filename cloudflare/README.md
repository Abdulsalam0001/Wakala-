# Wakala Neon staging — Cloudflare deployment

This Worker is a same-origin reverse proxy. It forwards request paths, query strings,
request bodies, session cookies, and response cookies to the isolated Render backend.
It does not connect to Neon directly; database credentials remain on the Node backend.

## 1. Configure the Render staging service

- Build command: `cd server && npm install`
- Start command: `cd server && npm run start:prod`
- `DATABASE_URL`: Neon connection string for the **staging branch only** (SSL enabled).
- `JWT_SECRET`: a randomly generated secret with at least 32 bytes of entropy.
- `NODE_ENV`: `production`
- `COOKIE_NAME`: `wakala_session`
- `APP_ORIGIN`: public staging origin.

Never copy production Supabase credentials or a production database URL into this service.
The start script applies the checked-in SQL migrations before starting the HTTP server.

## 2. Deploy the Cloudflare Worker

Install Wrangler and authenticate with the intended Cloudflare account. From the repository root:

```sh
cd cloudflare && npx wrangler deploy
```

The initial deployment uses a `workers.dev` URL and forwards to
`https://wakala-neon-staging.onrender.com`. Do not attach this Worker to `wakala.cfd`
or a production route before staging tests pass.

## 3. Verify

Replace `WORKER_URL` with the deployed `workers.dev` URL:

```sh
curl -i https://WORKER_URL/api/health
curl -i https://WORKER_URL/login.html
```

Health should return HTTP 200 and JSON with `ok: true` and `database: "connected"`.
If Render is suspended or Neon is unreachable, the Worker returns HTTP 502/503; a
successful Worker deployment alone does not prove login works.

Then test registration with a dedicated staging email, confirm the session cookie is
`HttpOnly` and `Secure`, log out, log back in, and verify `/api/auth/me`. Existing
Supabase passwords cannot be assumed to work in the new Neon authentication store.
Do not use real customer credentials or real money movement in staging.

## Cloudflare routing

Use the `workers.dev` hostname for initial testing. Once verified, create a dedicated
staging hostname in Cloudflare and route it to this Worker. Keep production DNS and the
current Supabase application unchanged until a separate, explicitly approved cutover.
