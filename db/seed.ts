import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";
import { syncStaticGtfs } from "../workers/gtfs-static/sync";

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_USE_SSL === "true" ? {} : undefined,
});

const db = drizzle(pool, { schema, mode: "default" });

await syncStaticGtfs(db as Parameters<typeof syncStaticGtfs>[0]);
console.log("Seed complete!");

await pool.end();
