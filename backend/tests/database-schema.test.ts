import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

test("phase 1 migration declares the required persistent domains", async () => {
  const migration = await readFile(
    join(here, "../migrations/005_phase1_database_architecture.sql"),
    "utf8"
  );

  const requiredTables = [
    "projects",
    "project_members",
    "user_settings",
    "project_settings",
    "project_tools",
    "tool_credentials",
    "agent_runs",
    "execution_logs"
  ];

  for (const table of requiredTables) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`),
      `missing table declaration: ${table}`
    );
  }

  assert.match(migration, /projects_repository_pair_unique/);
  assert.match(migration, /PRIMARY KEY \\(project_id, user_id\\)/);
  assert.match(migration, /UNIQUE \\(project_id, tool_key\\)/);
  assert.match(migration, /UNIQUE \\(agent_run_id, sequence\\)/);
});

test("migration runner includes the phase 1 migration", async () => {
  const runner = await readFile(
    join(here, "../src/db/migrate.ts"),
    "utf8"
  );

  assert.match(
    runner,
    /005_phase1_database_architecture\\.sql/
  );
  assert.match(runner, /schema_migrations/);
  assert.match(runner, /pg_advisory_lock/);
  assert.match(runner, /Migration failed:/);
});
const hasDatabase = Boolean(process.env.DATABASE_URL);

test(
  "live PostgreSQL schema exposes phase 1 tables and foreign keys",
  { skip: !hasDatabase },
  async () => {
    const { migrate } = await import("../src/db/migrate.js");
    const { pool } = await import("../src/db/pool.js");

    await migrate();

    const result = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name
    `, [[
      "projects",
      "project_members",
      "user_settings",
      "project_settings",
      "project_tools",
      "tool_credentials",
      "agent_runs",
      "execution_logs"
    ]]);

    assert.equal(result.rows.length, 8);

    const constraints = await pool.query<{ constraint_name: string }>(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
        AND constraint_name IN (
          'conversations_user_id_fkey'
        )
    `);

    assert.equal(
      constraints.rows.some(row => row.constraint_name === "conversations_user_id_fkey"),
      true
    );

    await pool.end();
  }
);
