# Silent Telegram signup notifications

The bot token must stay in Supabase secrets. Never put it in `index.html`, `supabase-config.js`, or GitHub.

## 1. Rotate the exposed token

Open Telegram and message `@BotFather`:

1. Run `/revoke` and select the bot.
2. Run `/token` and select the same bot.
3. Keep the new token private.

## 2. Find your Telegram chat ID

1. Open your bot in Telegram and send it `/start`.
2. Open this URL in a browser, replacing `NEW_TOKEN` with the rotated token:

`https://api.telegram.org/botNEW_TOKEN/getUpdates`

3. Copy the `message.chat.id` value from the response.

## 3. Deploy the Edge Function

Install and log in to the Supabase CLI, then run these commands from the repository root:

```bash
supabase link --project-ref swptbxwkvlacqhqetoia
supabase secrets set TELEGRAM_BOT_TOKEN=NEW_TOKEN TELEGRAM_CHAT_ID=YOUR_CHAT_ID
supabase functions deploy notify-telegram --no-verify-jwt
```

The function is intentionally webhook-compatible and does not require a user JWT because Supabase Database Webhooks call it server-to-server.

## 4. Create the database webhook

In Supabase, open **Database → Webhooks → Create a new webhook**:

- Name: `telegram-new-signup`
- Table: `profiles`
- Events: `Insert`
- Type: `Supabase Edge Functions`
- Function: `notify-telegram`

Save it and create a test account. The function sends the new user's name and email directly to the configured Telegram chat in the background. The user sees no Telegram message or extra step in the Wakala form.

If `profiles` already exists, run the latest `supabase-schema.sql` once in the Supabase SQL Editor so the email column and trigger are updated.
