const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const baseUrl = Deno.env.get('ESIM_ACCESS_BASE_URL') || 'https://api.esimaccess.com';
const accessCode = Deno.env.get('ESIM_ACCESS_CODE');
const secretKey = Deno.env.get('ESIM_SECRET_KEY');
const mockMode = Deno.env.get('ESIM_ACCESS_MOCK_MODE') === 'true';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' }
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if ((!accessCode || !secretKey) && !mockMode) return json({ error: 'eSIM Access credentials are not configured' }, 503);

  try {
    const payload = await request.json();
    const packageCode = String(payload.package_code || payload.packageCode || payload.plan || '');
    const country = String(payload.country || 'TZ').toUpperCase();

    if (!packageCode) return json({ error: 'A valid eSIM Access package code is required' }, 400);
    if (!/^[A-Z]{2}$/.test(country)) return json({ error: 'A valid two-letter country code is required' }, 400);
    if (mockMode) {
      const orderId = `WKL-MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      return json({
        mock: true,
        order: { id: orderId, status: 'mock_ready', packageCode, country },
        profile: { iccid: `MOCK-${Date.now()}`, lpa: 'LPA:1$mock.wakala.test$WAKALA-MOCK' }
      });
    }

    const requestId = crypto.randomUUID().replaceAll('-', '');
    const timestamp = Date.now().toString();
    const requestBody = JSON.stringify({ packageCode, count: 1 });
    const signData = `${timestamp}${requestId}${accessCode}${requestBody}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signData));
    const signature = [...new Uint8Array(signatureBytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const orderResponse = await fetch(`${baseUrl}/api/v1/open/esim/order`, {
      method: 'POST',
      headers: {
        'RT-AccessCode': accessCode,
        'RT-RequestID': requestId,
        'RT-Timestamp': timestamp,
        'RT-Signature': signature,
        'content-type': 'application/json'
      },
      body: requestBody
    });
    const orderBody = await orderResponse.json().catch(() => ({}));
    if (!orderResponse.ok) return json({ error: 'eSIM Access order failed', details: orderBody }, orderResponse.status);
    const result = orderBody.obj || orderBody.data || orderBody;
    return json({ order: result, profile: result, provider: 'esim-access' });
  } catch (error) {
    console.error('Nexar eSIM order error:', error);
    return json({ error: 'Invalid order request' }, 400);
  }
});
