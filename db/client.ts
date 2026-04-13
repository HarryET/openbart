import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export function createDb(env: Env) {
  const connectionString = env.HYPERDRIVE.connectionString;

  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema });
}
