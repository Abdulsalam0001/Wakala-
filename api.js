const WAKALA_API = {
  async request(path, options = {}) {
    const config = { credentials: "same-origin", ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } };
    const response = await fetch(path, config);
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload.error || "Request failed (" + response.status + ")");
    return payload;
  },
  me() { return this.request("/api/auth/me"); },
  register(email, password) { return this.request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }); },
  login(email, password) { return this.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); },
  logout() { return this.request("/api/auth/logout", { method: "POST" }); },
  profile() { return this.request("/api/profile"); },
  updateProfile(full_name, phone) { return this.request("/api/profile", { method: "PATCH", body: JSON.stringify({ full_name, phone }) }); },
  wallet() { return this.request("/api/wallet"); },
  transactions(limit = 50) { return this.request("/api/transactions?limit=" + encodeURIComponent(limit)); }
};
window.WAKALA_API = WAKALA_API;
