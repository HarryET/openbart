import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_USE_SSL === "true" ? {} : undefined,
});

const db = drizzle(pool);

await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("Migrations applied successfully!");

await pool.end();
