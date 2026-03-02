import { Pool } from "pg";
import { config } from "../config.js";

export const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: 20,
  idleTimeoutMillis: 30_000
});

export async function closePool(): Promise<void> {
  await pool.end();
}
