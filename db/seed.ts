import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { syncStaticGtfs } from "../workers/gtfs-static/sync";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_USE_SSL === "true" ? true : undefined,
});

const db = drizzle(pool, { schema });

await syncStaticGtfs(db as Parameters<typeof syncStaticGtfs>[0]);
console.log("Seed complete!");

await pool.end();
