# Original Wakala: Supabase -> Neon migration map

## Target

Keep the original Wakala HTML/CSS/JS pages and replace the Supabase dependency with a small same-origin backend:

Browser
-> /api
-> Node/Express
-> Neon Postgres

The browser never receives DATABASE_URL, JWT_SECRET, provider secret keys, webhook secrets, or admin credentials.

## Data mapping

| Supabase | Neon |
|---|---|
| auth.users | users |
| public.profiles | profiles |
| public.wallets | wallets |
| public.wallet_balances | wallet_balances |
| public.transactions | transactions |
| public.waitlist_signups | waitlist_signups |
| public.esim_orders | esim_orders |
| public.admin_roles | admin_roles |
| public.admin_users | admin_users |

The first migration deliberately preserves the important financial fields and the Wakala account-number format.

## Authentication reality

The existing Supabase public/publishable API key is not a database export key and does not expose customer password hashes. Do not try to migrate passwords with it.

Existing customers should therefore be migrated as customer/profile/wallet records and then sent through a controlled password-reset/re-enrollment flow.

New registrations can immediately use the Neon backend.

## Safe migration sequence

1. Restore the original Supabase project.
2. Export/backup all application data while it is still available.
3. Create the Neon database.
4. Run server/sql/001_initial.sql.
5. Import profiles, wallets, balances, transactions and eSIM orders.
6. Reconcile row counts and balance totals.
7. Import admin role/user records.
8. Deploy the backend with DATABASE_URL and JWT_SECRET as server environment variables.
9. Verify /api/health.
10. Switch register/login/profile/dashboard API calls from Supabase to /api.
11. Test a fresh customer from registration through onboarding and dashboard.
12. Test existing-customer re-enrollment.
13. Test wallet reads and transaction history.
14. Test admin functions.
15. Test eSIM order creation and provider webhooks.
16. Keep Supabase available as a rollback/read-only source until all checks pass.
17. Only then remove the Supabase client from the browser.

## Provider API keys

Provider credentials are separate from the database migration.

Use server environment variables such as:

- FLUTTERWAVE_SECRET_KEY
- FLUTTERWAVE_WEBHOOK_SECRET
- PAYSTACK_SECRET_KEY
- ESIM_PROVIDER_API_KEY
- ESIM_PROVIDER_WEBHOOK_SECRET

Use the provider's publishable key in browser code only when its documentation explicitly permits browser use.

Never commit these values to GitHub and never put secret keys in HTML/JS.

## Financial safety

Do not implement balance changes by trusting an amount supplied by the browser.

All credits/debits must happen in a server-side database transaction and create a transaction record with a unique reference. Provider webhooks must be authenticated and idempotent.

## Cutover rule

Supabase is the old source until reconciliation is complete.

Neon becomes the new source only after:

- users/profiles count matches
- wallet count matches
- every wallet has expected currencies
- transaction totals reconcile
- eSIM orders reconcile
- admin access works
- a complete registration/login/onboarding/dashboard test passes


## Migration progress

The original frontend now has a Neon API client at `/api.js`. The following flows have been moved off Supabase:

- Registration
- Login/session checks
- Profile onboarding
- Main dashboard wallet, balances, recent transactions and logout
- eSIM order submission
- eSIM order history

The backend now also exposes:

- `GET/POST /api/esim/orders`
- `GET /api/admin/overview`
- `GET /api/admin/customers`
- `GET /api/admin/customers/:userId/balances`
- `POST /api/admin/customers/:userId/adjust-balance`

Creator tables are staged in `server/sql/002_creator_tables.sql`.

The remaining Supabase-dependent pages are intentionally not removed yet. They should be migrated one flow at a time after their exact data requirements are mapped. Do not delete the Supabase project until migration reconciliation is complete.
