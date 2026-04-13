import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_USE_SSL === "true" ? true : undefined,
});

const db = drizzle(pool);

await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("Migrations applied successfully!");

await pool.end();
