import { randomBytes, createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { parseArgs } from "node:util";
import { apiKeys } from "./schema";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    email: { type: "string" },
    limit: { type: "string" },
  },
  strict: true,
});

if (!values.name) {
  console.error("Usage: npx tsx db/create-api-key.ts --name <owner> [--email <email>] [--limit <per-minute>]");
  process.exit(1);
}

const rateLimitPerMinute = values.limit ? Number.parseInt(values.limit, 10) : 300;
if (!Number.isFinite(rateLimitPerMinute) || rateLimitPerMinute <= 0) {
  console.error("--limit must be a positive integer");
  process.exit(1);
}

const rawKey = `ob_sk_${randomBytes(16).toString("hex")}`;
const keyHash = createHash("sha256").update(rawKey).digest("hex");
const keyPrefix = rawKey.slice(0, 12);

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_USE_SSL === "true" ? {} : undefined,
});

const db = drizzle(pool);

await db.insert(apiKeys).values({
  keyHash,
  keyPrefix,
  ownerName: values.name,
  ownerEmail: values.email ?? null,
  rateLimitPerMinute,
});

console.log("API key created. Save this key now — it will not be shown again:");
console.log();
console.log(`  ${rawKey}`);
console.log();
console.log(`Owner:        ${values.name}`);
if (values.email) console.log(`Email:        ${values.email}`);
console.log(`Rate limit:   ${rateLimitPerMinute} req/min`);
console.log(`Key prefix:   ${keyPrefix} (for identification in logs)`);

await pool.end();
