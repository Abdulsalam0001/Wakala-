# Wakala Neon backend

This is the first backend replica for the original Wakala project. It intentionally does not expose database credentials or provider secrets to browser code.

## Architecture

Browser -> same-origin /api -> Express -> Neon Postgres

Authentication is implemented with:
- bcrypt password hashes
- short, HTTP-only session cookie
- JWT session claims
- PostgreSQL as the source of truth

## Environment

Copy .env.example to .env and provide:
- DATABASE_URL: Neon pooled/direct Postgres connection string
- JWT_SECRET: long random server-only secret
- APP_ORIGIN: Wakala origin

Do not commit .env.

## First migration

1. Create a Neon project and database.
2. Run server/sql/001_initial.sql.
3. Start the backend with npm install && npm start.
4. Test GET /api/health.
5. Only after health succeeds, migrate customer/profile/wallet/transaction data.
6. Switch register/login/dashboard clients from Supabase to /api.

## Important authentication migration limitation

Supabase does not expose customer password hashes through the normal client/API keys. The existing Wakala users therefore cannot simply be copied with their passwords into this custom auth system. Preserve their account/profile/wallet data, then use a controlled password-reset/re-enrollment flow for existing customers.

## Provider secrets

Flutterwave, Paystack, eSIM provider, webhook signing secrets, and other private credentials belong only in server environment variables. A publishable/public key can remain in browser code only where the provider explicitly supports that model.

## Cutover

Keep Supabase read-only during the migration. Export/verify:
profiles -> users/profiles
wallets -> wallets
wallet_balances -> wallet_balances
transactions -> transactions
esim_orders -> esim_orders
admin_roles/admin_users -> admin tables

Then dual-test:
registration, login, onboarding, wallet balances, transactions, eSIM orders, admin access.

Only after parity is verified should the frontend stop calling Supabase.
