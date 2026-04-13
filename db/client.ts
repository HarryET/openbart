import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

export function createDb(env: Env) {
  const connection = mysql.createPool({
    host: env.HYPERDRIVE.host,
    user: env.HYPERDRIVE.user,
    password: env.HYPERDRIVE.password,
    database: env.HYPERDRIVE.database,
    port: env.HYPERDRIVE.port,
    disableEval: true,
  });
  return drizzle(connection, { schema, mode: "default" });
}
