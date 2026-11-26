import { Pool } from "pg";
import { config } from "../config.js";

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX
});

export async function checkDatabase(): Promise<void> {
  await pool.query("SELECT 1");
}
