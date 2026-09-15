import fs from 'node:fs';
import path from 'node:path';
import { FridayTask, TaskEvent, TaskPhase } from './contracts';

export class TaskStore {
  private readonly file: string;
  private tasks = new Map<string, FridayTask>();
  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'friday-tasks.json');
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      try { for (const task of JSON.parse(fs.readFileSync(this.file, 'utf8')) as FridayTask[]) this.tasks.set(task.id, task); } catch { /* start clean; do not trust corrupt history */ }
    }
  }
  create(command: string): FridayTask {
    const now = new Date().toISOString();
    const task: FridayTask = { id: crypto.randomUUID(), command, phase: 'UNDERSTAND', createdAt: now, updatedAt: now, authorizationRequired: false, authorizationGranted: false, events: [] };
    this.tasks.set(task.id, task); this.event(task, 'UNDERSTAND', 'Command received.'); return task;
  }
  get(id: string) { return this.tasks.get(id); }
  list(limit = 30) { return [...this.tasks.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit); }
  transition(task: FridayTask, phase: TaskPhase, message: string, details?: Record<string, unknown>) { task.phase = phase; this.event(task, phase, message, details); }
  event(task: FridayTask, phase: TaskPhase, message: string, details?: Record<string, unknown>) { const event: TaskEvent = { at: new Date().toISOString(), phase, message, details }; task.events.push(event); task.updatedAt = event.at; this.persist(); }
  private persist() { fs.writeFileSync(this.file, JSON.stringify(this.list(10_000), null, 2), { encoding: 'utf8', mode: 0o600 }); }
}
