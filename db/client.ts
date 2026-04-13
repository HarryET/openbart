import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

export function createDb(env: Env) {
  const pool = mysql.createPool({ uri: env.HYPERDRIVE.connectionString });
  return drizzle(pool, { schema, mode: "default" });
}
