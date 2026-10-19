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
  changePassword(current_password, new_password) { return this.request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }); },
  profile() { return this.request("/api/profile"); },
  updateProfile(full_name, phone) { return this.request("/api/profile", { method: "PATCH", body: JSON.stringify({ full_name, phone }) }); },
  wallet() { return this.request("/api/wallet"); },
  transactions(limit = 50) { return this.request("/api/transactions?limit=" + encodeURIComponent(limit)); },
  esimOrders() { return this.request("/api/esim/orders"); },
  createEsimOrder(order) { return this.request("/api/esim/orders", { method: "POST", body: JSON.stringify(order) }); },
  walletRequests() { return this.request("/api/wallet-requests"); },
  adminWalletRequests(status = "all") { return this.request("/api/admin/wallet-requests" + (status && status !== "all" ? "?status=" + encodeURIComponent(status) : "")); },
  reviewWalletRequest(id, status, admin_note = "") { return this.request("/api/admin/wallet-requests/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ status, admin_note }) }); },
  adminMe() { return this.request("/api/admin/me"); },
  adminOverview() { return this.request("/api/admin/overview"); },
  adminEsimOrders() { return this.request("/api/admin/esim-orders"); },
  adminCustomers(search = "") { return this.request("/api/admin/customers?search=" + encodeURIComponent(search)); },
  adminCustomerBalances(userId) { return this.request("/api/admin/customers/" + encodeURIComponent(userId) + "/balances"); },
  adjustBalance(userId, currency, direction, amount, reason) {
    return this.request("/api/admin/customers/" + encodeURIComponent(userId) + "/adjust-balance", { method: "POST", body: JSON.stringify({ currency, direction, amount, reason }) });
  },
  createWalletRequest(request_type, amount, currency, details) {
    return this.request("/api/wallet-requests", { method: "POST", body: JSON.stringify({ request_type, amount, currency, details }) });
  }
};
window.WAKALA_API = WAKALA_API;
