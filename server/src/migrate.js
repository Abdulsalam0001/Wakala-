import pg from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  max: 2,
  connectionTimeoutMillis: 10000
});

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required before applying the Wakala schema.");
  process.exit(1);
}

try {
  await pool.query("select 1");
  for (const file of ["001_initial.sql", "002_creator_tables.sql", "003_wallet_requests.sql"]) {
    const sql = await readFile(resolve(here, "../sql", file), "utf8");
    await pool.query(sql);
    console.log(`Applied idempotent schema file: ${file}`);
  }
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (adminEmail) {
    const result = await pool.query(
      `insert into admin_users(user_id,role_id,status)
       select u.id,ar.id,'active' from users u
       join admin_roles ar on ar.name='super_admin'
       where lower(u.email)= $1
       on conflict(user_id) do update set role_id=excluded.role_id,status='active',updated_at=now()
       returning user_id`,
      [adminEmail]
    );
    if (result.rowCount) console.log("Configured Wakala administrator is active.");
    else console.log("ADMIN_EMAIL is set, but that user has not registered yet.");
  }
  console.log("Wakala Neon schema is ready.");
} catch (error) {
  console.error("Wakala database setup failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
