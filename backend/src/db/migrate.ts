import type { PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationFiles = [
  "001_initial.sql",
  "002_conversations_memory_events.sql",
  "003_auth.sql",
  "004_files.sql",
  "005_phase1_database_architecture.sql",
  "006_oauth_identities.sql"
];

async function ensureMigrationLedger(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function migrate(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('friday_schema_migrations'))");
    await ensureMigrationLedger(client);

    for (const file of migrationFiles) {
      try {
        await client.query("BEGIN");

        const applied = await client.query<{ version: string }>(
          "SELECT version FROM schema_migrations WHERE version = $1",
          [file]
        );

        if (applied.rowCount !== 0) {
          await client.query("ROLLBACK");
          continue;
        }

        const sql = await readFile(join(here, "../../migrations", file), "utf8");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [file]
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration failed: ${file}`, { cause: error });
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('friday_schema_migrations'))");
    } finally {
      client.release();
    }
  }
}
