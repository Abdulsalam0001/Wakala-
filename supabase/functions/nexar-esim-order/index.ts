const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const baseUrl = Deno.env.get('NEXAR_BASE_URL') || 'https://resellers.nexarhq.com/api/v1/reseller';
const apiKey = Deno.env.get('NEXAR_API_KEY');
const mockMode = Deno.env.get('NEXAR_MOCK_MODE') === 'true';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' }
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!apiKey && !mockMode) return json({ error: 'Nexar API key is not configured' }, 503);

  try {
    const payload = await request.json();
    const plan = Number(payload.plan);
    const country = String(payload.country || '').toUpperCase();
    const walletCurrency = String(payload.wallet_currency || 'USDC').toUpperCase();

    if (!Number.isInteger(plan) || plan <= 0) return json({ error: 'A valid Nexar plan id is required' }, 400);
    if (!/^[A-Z]{2}$/.test(country)) return json({ error: 'A valid two-letter country code is required' }, 400);
    if (!['USDC', 'USDT', 'BTC'].includes(walletCurrency)) return json({ error: 'Unsupported wallet currency' }, 400);

    if (mockMode) {
      const orderId = `WKL-MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      return json({
        mock: true,
        order: { id: orderId, status: 'mock_ready', plan, country, wallet_currency: walletCurrency },
        profile: { iccid: `MOCK-${Date.now()}`, lpa: 'LPA:1$mock.wakala.test$WAKALA-MOCK' }
      });
    }

    const idempotencyKey = `wakala_${crypto.randomUUID()}`;
    const orderResponse = await fetch(`${baseUrl}/esim/orders`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Idempotency-Key': idempotencyKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ plan, country, wallet_currency: walletCurrency })
    });
    const orderBody = await orderResponse.json().catch(() => ({}));
    if (!orderResponse.ok) return json({ error: 'Nexar order failed', details: orderBody }, orderResponse.status);

    const orderId = orderBody.id || orderBody.order_id || orderBody.orderId;
    let profile = null;
    if (orderId) {
      const profileResponse = await fetch(`${baseUrl}/esim/orders/${encodeURIComponent(orderId)}/profile`, {
        headers: { 'X-API-Key': apiKey }
      });
      profile = await profileResponse.json().catch(() => null);
    }

    return json({ order: orderBody, profile, idempotency_key: idempotencyKey });
  } catch (error) {
    console.error('Nexar eSIM order error:', error);
    return json({ error: 'Invalid order request' }, 400);
  }
});
