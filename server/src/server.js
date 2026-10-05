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
