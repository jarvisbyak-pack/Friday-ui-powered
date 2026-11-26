import { AgentService } from "../agent/service.js";
import type { Task } from "../types/task.js";
import { PostgresTaskRepository } from "./task-repository.js";
import { TaskEventRepository } from "./task-events.js";

export class TaskWorker {
  private running = false;

  constructor(
    private readonly repository: PostgresTaskRepository,
    private readonly pollMs = 1000,
    private readonly staleTaskMs = 300000,
    private readonly agentService = new AgentService(),
    private readonly events = new TaskEventRepository()
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.repository.recoverStaleRunningTasks(this.staleTaskMs);
        const task = await this.repository.claimNext();
        if (task) {
          await this.events.append(task.id, "task.running", { type: task.type });
          await this.execute(task);
        } else {
          await this.sleep(this.pollMs);
        }
      } catch (error) {
        console.error("Task worker error:", error);
        await this.sleep(this.pollMs);
      }
    }
  }

  private async execute(task: Task): Promise<void> {
    try {
      if (task.type === "agent") {
        const input = task.input;
        if (!input || typeof input !== "object" || !("messages" in input)) {
          throw new Error("Agent task requires a messages array.");
        }

        const request = input as {
          messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
          model?: string;
          temperature?: number;
          maxSteps?: number;
        };

        if (!Array.isArray(request.messages) || request.messages.length === 0) {
          throw new Error("Agent task requires at least one message.");
        }

        const result = await this.agentService.run({
          ...request,
          taskId: task.id,
          userId: task.userId
        });
        await this.repository.complete(task.id, result);
        await this.events.append(task.id, "task.completed", { type: task.type });
        return;
      }

      const result = { status: "accepted", taskId: task.id, type: task.type };
      await this.repository.complete(task.id, result);
      await this.events.append(task.id, "task.completed", { type: task.type });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.fail(task.id, message);
      await this.events.append(task.id, "task.failed", { error: message });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(1, ms)));
  }
}
