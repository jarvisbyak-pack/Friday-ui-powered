import type { Task } from "../types/task.js";
import { PostgresTaskRepository } from "./task-repository.js";

export class TaskService {
  constructor(private readonly repository: PostgresTaskRepository) {}

  create(type: string, input: unknown, userId?: string): Promise<Task> {
    return this.repository.create(type, input, userId);
  }

  get(id: string, userId?: string): Promise<Task | undefined> {
    return this.repository.get(id, userId);
  }
}
