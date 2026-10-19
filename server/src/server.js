import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import crypto from "node:crypto";

const { Pool } = pg;
const app = express();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = process.env.COOKIE_NAME || "wakala_session";
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";

if (!process.env.DATABASE_URL || !JWT_SECRET) {
  throw new Error("DATABASE_URL and JWT_SECRET are required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10
});

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d", issuer: "wakala" }
  );
}

function setSession(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Authentication required" });
    req.user = jwt.verify(token, JWT_SECRET, { issuer: "wakala" });
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}


async function requireAdmin(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select ar.name as role
       from admin_users au
       join admin_roles ar on ar.id = au.role_id
       where au.user_id=$1 and au.status='active'`,
      [req.user.sub]
    );
    if (!rows.length) return res.status(403).json({ error: "Administrator access required" });
    req.adminRole = rows[0].role;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to verify administrator access" });
  }
}

async function getUser(client, id) {
  const { rows } = await client.query(
    "select id,email,status,created_at from users where id=$1",
    [id]
  );
  return rows[0] || null;
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true, service: "wakala-backend", database: "connected" });
  } catch {
    res.status(503).json({ ok: false, service: "wakala-backend", database: "unavailable" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query("select id from users where email=$1", [email]);
    if (existing.rowCount) {
      await client.query("rollback");
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await client.query(
      "insert into users(email,password_hash) values($1,$2) returning id,email,status,created_at",
      [email, hash]
    );
    await client.query("commit");

    const user = rows[0];
    const configuredAdmin = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (configuredAdmin && configuredAdmin === email) {
      await pool.query(
        `insert into admin_users(user_id,role_id,status)
         select $1,id,'active' from admin_roles where name='super_admin'
         on conflict(user_id) do update set role_id=excluded.role_id,status='active',updated_at=now()`,
        [user.id]
      );
    }
    setSession(res, signSession(user));
    res.status(201).json({ user });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error(error);
    res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const { rows } = await pool.query(
    "select id,email,password_hash,status from users where email=$1",
    [email]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "This account is not active" });
  }

  setSession(res, signSession(user));
  res.json({ user: { id: user.id, email: user.email, status: user.status } });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ ok: true });
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  const currentPassword = String(req.body.current_password || "");
  const newPassword = String(req.body.new_password || "");
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: "Choose a password different from your current password" });
  }
  try {
    const { rows } = await pool.query("select password_hash from users where id=$1", [req.user.sub]);
    if (!rows.length || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query("update users set password_hash=$1,updated_at=now() where id=$2", [passwordHash, req.user.sub]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Password change failed:", error);
    res.status(500).json({ error: "Could not update password" });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await getUser(pool, req.user.sub);
  if (!user) return res.status(401).json({ error: "Account not found" });
  res.json({ user });
});

app.get("/api/profile", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "select id,full_name,email,phone,onboarding_completed,created_at,updated_at from profiles where id=$1",
    [req.user.sub]
  );
  res.json({ profile: rows[0] || null });
});

app.patch("/api/profile", requireAuth, async (req, res) => {
  const fullName = String(req.body.full_name || "").trim().replace(/\s+/g, " ");
  const phone = String(req.body.phone || "").trim();
  if (fullName.length < 2) return res.status(400).json({ error: "Full name is required" });
  if (phone.replace(/\D/g, "").length < 7) return res.status(400).json({ error: "Valid phone number is required" });

  const { rows } = await pool.query(
    `update profiles
     set full_name=$1,phone=$2,onboarding_completed=true,updated_at=now()
     where id=$3
     returning id,full_name,email,phone,onboarding_completed,created_at,updated_at`,
    [fullName, phone, req.user.sub]
  );
  res.json({ profile: rows[0] });
});

app.get("/api/wallet", requireAuth, async (req, res) => {
  const wallet = await pool.query(
    "select id,account_number,status,created_at from wallets where user_id=$1",
    [req.user.sub]
  );
  if (!wallet.rowCount) return res.status(404).json({ error: "Wallet not found" });

  const balances = await pool.query(
    "select currency,available,pending,updated_at from wallet_balances where wallet_id=$1 order by currency",
    [wallet.rows[0].id]
  );
  res.json({ wallet: wallet.rows[0], balances: balances.rows });
});

app.get("/api/transactions", requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  const { rows } = await pool.query(
    `select id,amount,currency,type,status,description,reference,metadata,created_at,completed_at
     from transactions where user_id=$1 order by created_at desc limit $2`,
    [req.user.sub, limit]
  );
  res.json({ transactions: rows });
});

app.get("/api/wallet-requests", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `select id,reference,request_type,amount,currency,details,status,admin_note,created_at,updated_at
     from wallet_requests where user_id=$1 order by created_at desc limit 100`,
    [req.user.sub]
  );
  res.json({ requests: rows });
});

app.post("/api/wallet-requests", requireAuth, async (req, res) => {
  const requestType = String(req.body.request_type || "").trim().toLowerCase();
  const amount = Number(req.body.amount);
  const currency = String(req.body.currency || "").trim().toUpperCase();
  const details = req.body.details && typeof req.body.details === "object" && !Array.isArray(req.body.details)
    ? req.body.details : {};

  if (!["deposit", "transfer", "withdrawal"].includes(requestType)) {
    return res.status(400).json({ error: "Unsupported wallet request type" });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    return res.status(400).json({ error: "Enter a valid request amount" });
  }
  if (!/^[A-Z0-9]{2,10}$/.test(currency)) {
    return res.status(400).json({ error: "Enter a valid currency code" });
  }
  if (requestType === "deposit" &&
      (!String(details.sender_name || "").trim() || !String(details.sender_transaction_reference || "").trim())) {
    return res.status(400).json({ error: "Sender name and payment reference are required for deposit review" });
  }
  if (requestType === "transfer" &&
      (!String(details.recipient_name || "").trim() || !String(details.send_currency || currency).trim())) {
    return res.status(400).json({ error: "Recipient details are required for a transfer request" });
  }

  const reference = "WKREQ-" + crypto.randomBytes(8).toString("hex").toUpperCase();
  try {
    const { rows } = await pool.query(
      `insert into wallet_requests(reference,user_id,request_type,amount,currency,details)
       values($1,$2,$3,$4,$5,$6)
       returning id,reference,request_type,amount,currency,details,status,created_at`,
      [reference, req.user.sub, requestType, amount, currency, JSON.stringify(details)]
    );
    res.status(201).json({ request: rows[0] });
  } catch (error) {
    console.error("Wallet request creation failed:", error);
    res.status(500).json({ error: "Could not submit the request. Please try again." });
  }
});


app.get("/api/creator/campaigns", async (_req, res) => {
  const { rows } = await pool.query(
    `select id,title,description,platform,content_type,reward_per_1000_impressions,
            max_reward,requirements,status,created_at
     from creator_campaigns where status='active' order by created_at desc`
  );
  res.json({ campaigns: rows });
});

app.post("/api/creator/applications", requireAuth, async (req, res) => {
  const campaignId = Number(req.body.campaign_id);
  const platform = String(req.body.platform || "").trim().slice(0, 80);
  const portfolioUrl = String(req.body.portfolio_url || "").trim().slice(0, 2048);
  const applicationNote = String(req.body.application_note || "").trim().slice(0, 5000);
  const followersRaw = req.body.followers_count;
  const followersCount = followersRaw === "" || followersRaw == null ? null : Number(followersRaw);
  const contentFormat = String(req.body.content_format || "").trim().slice(0, 120);
  const contentIdea = String(req.body.content_idea || "").trim().slice(0, 2000);

  if (!Number.isSafeInteger(campaignId) || campaignId <= 0 || !platform || !applicationNote) {
    return res.status(400).json({ error: "Choose a campaign and complete your application details" });
  }
  if (portfolioUrl && !/^https?:\/\//i.test(portfolioUrl)) {
    return res.status(400).json({ error: "Portfolio/profile URL must start with http:// or https://" });
  }
  if (followersCount !== null && (!Number.isSafeInteger(followersCount) || followersCount < 0)) {
    return res.status(400).json({ error: "Follower count must be a non-negative whole number" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: campaigns } = await client.query(
      "select id from creator_campaigns where id=$1 and status='active' for update",
      [campaignId]
    );
    if (!campaigns.length) {
      await client.query("rollback");
      return res.status(404).json({ error: "This creator campaign is no longer available" });
    }
    const { rows } = await client.query(
      `insert into creator_applications
       (user_id,campaign_id,platform,username,portfolio_url,application_note,followers_count,content_format,content_idea,status)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
       on conflict (user_id,campaign_id) where campaign_id is not null do nothing
       returning id,campaign_id,platform,portfolio_url,application_note,followers_count,content_format,content_idea,status,created_at`,
      [req.user.sub,campaignId,platform,null,portfolioUrl || null,applicationNote,followersCount,contentFormat || null,contentIdea || null]
    );
    if (!rows.length) {
      await client.query("rollback");
      return res.status(409).json({ error: "You have already applied to this campaign" });
    }
    await client.query("update creator_campaigns set application_count=application_count+1,updated_at=now() where id=$1", [campaignId]);
    await client.query("commit");
    res.status(201).json({ application: rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error("Creator application failed:", error);
    res.status(500).json({ error: "Could not submit your creator application" });
  } finally {
    client.release();
  }
});

app.get("/api/esim/orders", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `select id,country_code,country_name,currency,plan_data,validity_days,price_usd,
            customer_price,delivery_email,device,notes,status,provisioning_target,iccid,qr_code,
            created_at,updated_at
     from esim_orders where user_id=$1 order by created_at desc`,
    [req.user.sub]
  );
  res.json({ orders: rows });
});

app.post("/api/esim/orders", requireAuth, async (req, res) => {
  const {
    country_code, country_name, currency, plan_data, validity_days,
    price_usd, customer_price, delivery_email, device, notes
  } = req.body || {};

  if (!country_code || !country_name || !currency || !plan_data || !delivery_email || !device) {
    return res.status(400).json({ error: "Complete eSIM order details are required" });
  }
  if (!Number.isFinite(Number(validity_days)) || Number(validity_days) <= 0 ||
      !Number.isFinite(Number(price_usd)) || Number(price_usd) < 0 ||
      !Number.isFinite(Number(customer_price)) || Number(customer_price) < 0) {
    return res.status(400).json({ error: "Invalid eSIM pricing or validity" });
  }

  try {
    const { rows } = await pool.query(
      `insert into esim_orders
       (user_id,country_code,country_name,currency,plan_data,validity_days,price_usd,
        customer_price,delivery_email,device,notes,status,provisioning_target)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_admin_review','within_1_hour')
       returning id,country_code,country_name,currency,plan_data,validity_days,price_usd,
                 customer_price,delivery_email,device,notes,status,provisioning_target,created_at`,
      [req.user.sub,country_code,country_name,currency,plan_data,Number(validity_days),
       Number(price_usd),Number(customer_price),String(delivery_email).trim().toLowerCase(),
       String(device).trim(),notes ? String(notes).trim() : null]
    );
    res.status(201).json({ order: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not submit eSIM order" });
  }
});

app.get("/api/admin/me", requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query("select id,email from users where id=$1", [req.user.sub]);
  res.json({ user: rows[0] || null, role: req.adminRole });
});

app.get("/api/admin/esim-orders", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(
    `select eo.id,eo.user_id,eo.country_code,eo.country_name,eo.currency,eo.plan_data,
            eo.validity_days,eo.price_usd,eo.customer_price,eo.delivery_email,eo.device,eo.notes,
            eo.status,eo.created_at,p.full_name,p.email
     from esim_orders eo left join profiles p on p.id=eo.user_id
     order by eo.created_at desc limit 20`
  );
  res.json({ orders: rows });
});

app.get("/api/admin/overview", requireAuth, requireAdmin, async (_req, res) => {
  const [{ rows: userRows }, { rows: esimRows }, { rows: balanceRows }, { rows: txRows }] = await Promise.all([
    pool.query("select count(*)::int as total_users from profiles"),
    pool.query("select count(*)::int as total_esim_orders, count(*) filter (where status in ('pending','pending_admin_review'))::int as pending_esim_orders from esim_orders"),
    pool.query("select currency,coalesce(sum(available),0) as balance from wallet_balances group by currency order by currency"),
    pool.query("select id,user_id,amount,currency,type,status,description,created_at from transactions order by created_at desc limit 10")
  ]);
  res.json({
    total_users: userRows[0]?.total_users || 0,
    total_esim_orders: esimRows[0]?.total_esim_orders || 0,
    pending_esim_orders: esimRows[0]?.pending_esim_orders || 0,
    balances: balanceRows,
    recent_transactions: txRows
  });
});

app.get("/api/admin/wallet-requests", requireAuth, requireAdmin, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const params = status ? [status] : [];
  const where = status ? "where wr.status=$1" : "";
  const { rows } = await pool.query(
    `select wr.id,wr.reference,wr.user_id,wr.request_type,wr.amount,wr.currency,wr.details,
            wr.status,wr.admin_note,wr.created_at,wr.updated_at,p.full_name,p.email
     from wallet_requests wr join profiles p on p.id=wr.user_id
     ${where}
     order by wr.created_at desc limit 200`,
    params
  );
  res.json({ requests: rows });
});

app.patch("/api/admin/wallet-requests/:id", requireAuth, requireAdmin, async (req, res) => {
  const status = String(req.body.status || "").trim().toLowerCase();
  const adminNote = String(req.body.admin_note || "").trim().slice(0, 1000);
  if (!["pending_admin_review", "approved", "rejected", "completed"].includes(status)) {
    return res.status(400).json({ error: "Unsupported request status" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      "select * from wallet_requests where id=$1 for update",
      [req.params.id]
    );
    const request = rows[0];
    if (!request) {
      await client.query("rollback");
      return res.status(404).json({ error: "Wallet request not found" });
    }
    if (request.status === "completed") {
      await client.query("rollback");
      return res.status(409).json({ error: "This request has already been completed" });
    }
    if (status === "completed" && request.request_type !== "deposit") {
      await client.query("rollback");
      return res.status(400).json({ error: "Only a verified deposit can be completed automatically. Transfers require a connected provider." });
    }
    if (status === "completed" && request.request_type === "deposit") {
      const { rows: wallets } = await client.query(
        "select id from wallets where user_id=$1 order by created_at asc,id asc limit 1 for update",
        [request.user_id]
      );
      if (!wallets.length) {
        await client.query("rollback");
        return res.status(404).json({ error: "Customer wallet not found" });
      }
      const walletId = wallets[0].id;
      await client.query(
        "insert into wallet_balances(wallet_id,currency) values($1,$2) on conflict(wallet_id,currency) do nothing",
        [walletId, request.currency]
      );
      const { rows: balances } = await client.query(
        "update wallet_balances set available=available+$1,updated_at=now() where wallet_id=$2 and currency=$3 returning available",
        [request.amount, walletId, request.currency]
      );
      await client.query(
        `insert into transactions(user_id,wallet_id,amount,currency,type,status,description,reference,metadata,completed_at)
         values($1,$2,$3,$4,'deposit','completed','Admin-verified deposit',$5,$6,now())`,
        [request.user_id,walletId,request.amount,request.currency,request.reference,
         JSON.stringify({source:"admin_wallet_request",admin_user_id:req.user.sub,request_id:request.id})]
      );
      const { rows: updated } = await client.query(
        `update wallet_requests set status='completed',admin_note=$1,reviewed_by=$2,reviewed_at=now(),updated_at=now()
         where id=$3 returning id,reference,status,admin_note,updated_at`,
        [adminNote,req.user.sub,request.id]
      );
      await client.query("commit");
      return res.json({ request: updated[0], credited_amount: request.amount, currency: request.currency, available_balance: balances[0].available });
    }
    const { rows: updated } = await client.query(
      `update wallet_requests set status=$1,admin_note=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now()
       where id=$4 returning id,reference,status,admin_note,updated_at`,
      [status,adminNote,req.user.sub,request.id]
    );
    await client.query("commit");
    res.json({ request: updated[0] });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error("Wallet request review failed:", error);
    res.status(500).json({ error: "Could not update wallet request" });
  } finally {
    client.release();
  }
});

app.get("/api/admin/customers", requireAuth, requireAdmin, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const pattern = "%" + search + "%";
  const { rows } = await pool.query(
    `select p.id as user_id,p.full_name,p.email,p.phone,u.status,u.created_at,
            w.account_number
     from profiles p join users u on u.id=p.id
     left join lateral (
       select account_number from wallets where user_id=p.id order by created_at asc,id asc limit 1
     ) w on true
     where $1='' or p.full_name ilike $2 or p.email ilike $2 or p.phone ilike $2 or w.account_number ilike $2
     order by u.created_at desc`,
    [search, pattern]
  );
  res.json({ customers: rows });
});

app.get("/api/admin/customers/:userId/balances", requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `select wb.currency,wb.available,wb.pending
     from wallet_balances wb join wallets w on w.id=wb.wallet_id
     where w.user_id=$1 order by wb.currency`,
    [req.params.userId]
  );
  res.json({ balances: rows });
});

app.post("/api/admin/customers/:userId/adjust-balance", requireAuth, requireAdmin, async (req, res) => {
  const currency = String(req.body.currency || "").trim().toUpperCase();
  const direction = String(req.body.direction || "").trim().toLowerCase();
  const amount = Math.abs(Number(req.body.amount));
  const reason = String(req.body.reason || "").trim();

  if (!currency || !["credit","debit"].includes(direction) || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Valid currency, direction and amount are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: wallets } = await client.query(
      "select id from wallets where user_id=$1 order by created_at asc,id asc limit 1 for update",
      [req.params.userId]
    );
    if (!wallets.length) {
      await client.query("rollback");
      return res.status(404).json({ error: "Customer wallet not found" });
    }

    const walletId = wallets[0].id;
    await client.query(
      "insert into wallet_balances(wallet_id,currency) values($1,$2) on conflict(wallet_id,currency) do nothing",
      [walletId,currency]
    );
    const delta = direction === "credit" ? amount : -amount;
    const { rows: balances } = await client.query(
      "update wallet_balances set available=available+$1,updated_at=now() where wallet_id=$2 and currency=$3 and available+$1 >= 0 returning available",
      [delta,walletId,currency]
    );
    if (!balances.length) {
      await client.query("rollback");
      return res.status(400).json({ error: "Insufficient available balance for this debit" });
    }
    const reference = "ADM-" + crypto.randomBytes(10).toString("hex").toUpperCase();
    await client.query(
      `insert into transactions(user_id,wallet_id,amount,currency,type,status,description,reference,metadata,completed_at)
       values($1,$2,$3,$4,'adjustment','completed',$5,$6,$7,now())`,
      [req.params.userId,walletId,delta,currency,reason || "Administrative wallet adjustment",reference,
       JSON.stringify({source:"admin",admin_user_id:req.user.sub,direction,reason})]
    );
    await client.query("commit");
    res.json({ success:true,currency,direction,adjustment_amount:amount,new_available_balance:balances[0].available,reference });
  } catch (error) {
    await client.query("rollback").catch(()=>{});
    console.error(error);
    res.status(500).json({ error: "Wallet adjustment failed" });
  } finally {
    client.release();
  }
});

app.post("/api/waitlist", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Name and valid email are required" });
  }
  try {
    await pool.query(
      "insert into waitlist_signups(name,email) values($1,$2) on conflict(email) do nothing",
      [name,email]
    );
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not join waitlist" });
  }
});

app.use(express.static(new URL("../../", import.meta.url).pathname));

app.listen(PORT, () => {
  console.log(`Wakala backend listening on port ${PORT}`);
  console.log(`Origin: ${APP_ORIGIN}`);
});
