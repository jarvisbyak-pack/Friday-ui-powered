import { pool } from "../db/pool.js";
import type { Task, TaskState } from "../types/task.js";

type TaskRow = {
  id: string;
  type: string;
  input: unknown;
  state: TaskState;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
  error: string | null;
  result: unknown;
};

function toTask(row: TaskRow | undefined): Task {
  if (!row) {
    throw new Error("Expected a task row but none was returned.");
  }

  return {
    id: row.id,
    type: row.type,
    input: row.input,
    state: row.state,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.user_id === null ? {} : { userId: row.user_id }),
    ...(row.error === null ? {} : { error: row.error }),
    ...(row.result === null ? {} : { result: row.result })
  };
}

const columns = "id, type, input, state, user_id, created_at, updated_at, error, result";

export class PostgresTaskRepository {
  async create(type: string, input: unknown, userId?: string): Promise<Task> {
    const { rows } = await pool.query<TaskRow>(
      `INSERT INTO tasks (type, input, user_id)
       VALUES ($1, $2::jsonb, $3)
       RETURNING ${columns}`,
      [type, JSON.stringify(input ?? null), userId ?? null]
    );
    return toTask(rows[0]);
  }

  async get(id: string, userId?: string): Promise<Task | undefined> {
    const { rows } = await pool.query<TaskRow>(
      `SELECT ${columns}
       FROM tasks
       WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2)`,
      [id, userId ?? null]
    );
    return rows[0] ? toTask(rows[0]) : undefined;
  }

  async claimNext(): Promise<Task | undefined> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<TaskRow>(
        `SELECT ${columns}
         FROM tasks
         WHERE state IN ('queued', 'retrying')
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1`
      );

      const row = rows[0];
      if (!row) {
        await client.query("COMMIT");
        return undefined;
      }

      await client.query(
        `UPDATE tasks SET state = 'running', updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
      await client.query("COMMIT");

      return toTask({
        ...row,
        state: "running",
        updated_at: new Date()
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(id: string, result: unknown): Promise<void> {
    await pool.query(
      `UPDATE tasks
       SET state = 'completed', result = $2::jsonb, error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(result ?? null)]
    );
  }

  async fail(id: string, error: string): Promise<void> {
    await pool.query(
      `UPDATE tasks
       SET state = 'failed', error = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, error]
    );
  }

  async recoverStaleRunningTasks(timeoutMs: number): Promise<number> {
    const safeTimeout = Number.isFinite(timeoutMs) ? Math.max(1, timeoutMs) : 300000;
    const { rowCount } = await pool.query(
      `UPDATE tasks
       SET state = 'retrying',
           error = COALESCE(error, 'Worker stopped before task completed.'),
           updated_at = NOW()
       WHERE state = 'running'
         AND updated_at < NOW() - ($1::double precision * INTERVAL '1 millisecond')`,
      [safeTimeout]
    );
    return rowCount ?? 0;
  }
}
