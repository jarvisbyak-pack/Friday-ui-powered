export const TASK_STATES = [
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "retrying"
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export interface Task {
  id: string;
  type: string;
  input: unknown;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  error?: string;
  result?: unknown;
}
