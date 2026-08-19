const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!telegramBotToken || !telegramChatId) {
    return Response.json({ error: 'Telegram secrets are not configured' }, { status: 500 });
  }

  try {
    const payload = await request.json();
    const record = payload.record ?? {};
    const name = escapeHtml(record.full_name || 'Not provided');
    const email = escapeHtml(record.email || 'Not provided');
    const createdAt = escapeHtml(record.created_at || new Date().toISOString());
    const message = [
      '<b>New Wakala signup</b>',
      '',
      `<b>Name:</b> ${name}`,
      `<b>Email:</b> ${email}`,
      `<b>Created:</b> ${createdAt}`
    ].join('\n');

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: message,
          parse_mode: 'HTML'
        })
      }
    );

    if (!telegramResponse.ok) {
      const details = await telegramResponse.text();
      console.error('Telegram API error:', details);
      return Response.json({ error: 'Telegram notification failed' }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Notification error:', error);
    return Response.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }
});
