const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const HOP_BY_HOP_HEADERS = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade"
];

export default {
  async fetch(request, env) {
    if (!env.BACKEND_ORIGIN) {
      return new Response("Cloudflare Worker is missing BACKEND_ORIGIN.", { status: 500 });
    }

    const incomingUrl = new URL(request.url);
    const backendOrigin = new URL(env.BACKEND_ORIGIN);
    if (!["https:", "http:"].includes(backendOrigin.protocol)) {
      return new Response("BACKEND_ORIGIN must use HTTP or HTTPS.", { status: 500 });
    }

    const upstreamUrl = new URL(backendOrigin.origin);
    upstreamUrl.pathname = incomingUrl.pathname;
    upstreamUrl.search = incomingUrl.search;
    const headers = new Headers(request.headers);
    for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
    headers.delete("host");
    headers.set("x-forwarded-host", incomingUrl.host);
    headers.set("x-forwarded-proto", incomingUrl.protocol.slice(0, -1));

    const init = { method: request.method, headers, redirect: "manual" };
    if (!SAFE_METHODS.has(request.method)) init.body = request.body;

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(new Request(upstreamUrl, init));
    } catch (error) {
      console.error("Wakala upstream request failed:", error);
      return Response.json(
        { error: "Wakala backend is temporarily unavailable" },
        { status: 502, headers: { "cache-control": "no-store" } }
      );
    }

    const responseHeaders = new Headers(upstreamResponse.headers);
    for (const name of HOP_BY_HOP_HEADERS) responseHeaders.delete(name);

    const location = responseHeaders.get("location");
    if (location) {
      try {
        const redirectUrl = new URL(location, backendOrigin);
        if (redirectUrl.origin === backendOrigin.origin) {
          redirectUrl.host = incomingUrl.host;
          redirectUrl.protocol = incomingUrl.protocol;
          responseHeaders.set("location", redirectUrl.toString());
        }
      } catch {
        // Preserve non-URL Location values as supplied by the backend.
      }
    }

    responseHeaders.set("x-content-type-options", "nosniff");
    responseHeaders.set("referrer-policy", "strict-origin-when-cross-origin");
    if (incomingUrl.pathname.startsWith("/api/")) responseHeaders.set("cache-control", "no-store");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders
    });
  }
};
