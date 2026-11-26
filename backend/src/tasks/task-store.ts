import { randomUUID } from "node:crypto";
import type { Task, TaskState } from "../types/task.js";

export class InMemoryTaskStore {
  private readonly tasks = new Map<string, Task>();

  create(type: string, input: unknown): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      type,
      input,
      state: "queued",
      createdAt: now,
      updatedAt: now
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  updateState(
    id: string,
    state: TaskState,
    patch: Partial<Pick<Task, "error" | "result">> = {}
  ): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updated: Task = {
      ...task,
      ...patch,
      state,
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(id, updated);
    return updated;
  }
}
