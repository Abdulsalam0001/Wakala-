import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sameSecret(a: string, b: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const expectedSecret = Deno.env.get("MOA_WAKALA_TRACKER_SECRET");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!expectedSecret || !serviceKey || !supabaseUrl) {
      console.error("Payment tracker environment is incomplete");
      return json({ error: "Tracker is not configured" }, 503);
    }

    const authorization = req.headers.get("Authorization") || "";
    const suppliedSecret = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    if (!suppliedSecret || !(await sameSecret(suppliedSecret, expectedSecret))) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const source = "masters_of_arts";
    const externalOrderId = String(body?.externalOrderId || "").trim();
    const orderNumber = String(body?.orderNumber || "").trim();
    const paymentReference = String(body?.paymentReference || "").trim();
    const customerName = String(body?.customerName || "").trim();
    const customerEmail = String(body?.customerEmail || "").trim().toLowerCase();
    const customerPhone = String(body?.customerPhone || "").trim();
    const amount = Number(body?.amount);
    const currency = String(body?.currency || "NGN").trim().toUpperCase();

    if (
      !externalOrderId || externalOrderId.length > 160 ||
      !orderNumber || orderNumber.length > 80 ||
      !paymentReference || paymentReference.length > 160 ||
      customerName.length < 2 || customerName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
      !Number.isFinite(amount) || amount <= 0 ||
      !/^[A-Z]{3}$/.test(currency)
    ) return json({ error: "Invalid transaction payload" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const record = {
      source,
      external_order_id: externalOrderId,
      order_number: orderNumber,
      payment_reference: paymentReference,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      amount,
      currency,
      status: "awaiting_payment",
      event_type: "order_created",
      metadata: { integration: "masters-of-arts-checkout" },
    };

    const { data, error } = await supabase
      .from("external_payment_trackers")
      .insert(record)
      .select("id, tracker_reference, status")
      .single();

    if (error?.code === "23505") {
      const { data: existing, error: lookupError } = await supabase
        .from("external_payment_trackers")
        .select("id, tracker_reference, status")
        .eq("source", source)
        .eq("external_order_id", externalOrderId)
        .maybeSingle();
      if (lookupError || !existing) {
        console.error("Duplicate tracker lookup failed", lookupError);
        return json({ error: "Could not resolve existing tracker" }, 500);
      }
      return json({ ok: true, duplicate: true, ...existing });
    }
    if (error || !data) {
      console.error("Could not record external payment", error);
      return json({ error: "Could not record transaction" }, 500);
    }

    return json({ ok: true, duplicate: false, ...data }, 201);
  } catch (error) {
    console.error("External payment tracker error", error);
    return json({ error: "Invalid tracker request" }, 400);
  }
});
