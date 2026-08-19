# Silent Telegram signup notifications

Supabase remains responsible for authentication and app data. Telegram is a separate notification endpoint called directly after signup; no database webhook is used.

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
supabase functions deploy notify-telegram
```

The function requires the signed-in user's Supabase session. The browser invokes it directly after signup; no database webhook is used.

## 4. Test the separate notification endpoint

No database webhook is required. The signup form calls `notify-telegram` directly after Supabase returns a logged-in session. The user is redirected to the dashboard even if Telegram is unavailable.

If `profiles` already exists, run the latest `supabase-schema.sql` once in the Supabase SQL Editor so the email column and trigger are updated.
