import { pool } from "../db/pool.js";

export type TaskEvent = {
  id: number;
  taskId: string;
  sequence: number;
  type: string;
  payload?: unknown;
  createdAt: string;
};

export class TaskEventRepository {
  async append(taskId: string, type: string, payload?: unknown): Promise<TaskEvent> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [taskId]);

      const { rows } = await client.query<{
        id: number;
        task_id: string;
        sequence: string;
        type: string;
        payload: unknown;
        created_at: Date;
      }>(
        `INSERT INTO task_events (task_id, sequence, type, payload)
         VALUES (
           $1,
           COALESCE((SELECT MAX(sequence) + 1 FROM task_events WHERE task_id = $1), 1),
           $2,
           $3::jsonb
         )
         RETURNING id, task_id, sequence, type, payload, created_at`,
        [taskId, type, JSON.stringify(payload ?? null)]
      );

      await client.query("COMMIT");
      const row = rows[0]!;
      return {
        id: row.id,
        taskId: row.task_id,
        sequence: Number(row.sequence),
        type: row.type,
        ...(row.payload === null ? {} : { payload: row.payload }),
        createdAt: row.created_at.toISOString()
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAfter(taskId: string, afterSequence = 0, limit = 100): Promise<TaskEvent[]> {
    const safeAfter = Number.isSafeInteger(afterSequence) && afterSequence >= 0 ? afterSequence : 0;
    const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
    const { rows } = await pool.query<{
      id: number;
      task_id: string;
      sequence: string;
      type: string;
      payload: unknown;
      created_at: Date;
    }>(
      `SELECT id, task_id, sequence, type, payload, created_at
       FROM task_events
       WHERE task_id = $1 AND sequence > $2
       ORDER BY sequence ASC
       LIMIT $3`,
      [taskId, safeAfter, safeLimit]
    );
    return rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      sequence: Number(row.sequence),
      type: row.type,
      ...(row.payload === null ? {} : { payload: row.payload }),
      createdAt: row.created_at.toISOString()
    }));
  }
}
