import { FridayTask } from './contracts';
import { TaskStore } from './task-store';
import { ToolRegistry } from './tools';
import { friendlyFailure, friendlyPlan } from './personality';

export class FridayOrchestrator {
  constructor(private store: TaskStore, private tools: ToolRegistry) {}
  async submit(command: string): Promise<FridayTask> {
    const task = this.store.create(command);
    const match = command.match(/^(?:run|execute)\s+(?:my\s+)?(.+?)(?:\s+workflow)?[.!?\s]*$/i);
    if (!match) { this.fail(task, friendlyFailure('I can’t form an executable plan from that yet. Give me a supported tool and a clear action, and I’ll map it out.')); return task; }
    const requestedName = match[1].replace(/\s+workflow$/i, '').trim();
    this.store.transition(task, 'PLAN', friendlyPlan('I’m checking n8n workflows with a read-only lookup first.'), { requestedName });
    const workflows = await this.tools.n8n.listWorkflows();
    if (!workflows.ok) { this.fail(task, friendlyFailure(`workflow discovery failed: ${workflows.error} No execution was attempted.`)); return task; }
    const candidates = extractWorkflows(workflows.data).filter((workflow) => workflow.name.toLowerCase().includes(requestedName.toLowerCase()));
    if (candidates.length !== 1) { this.fail(task, friendlyFailure(candidates.length ? `I found ${candidates.length} workflow matches, so I’m not guessing. No execution was attempted.` : `I couldn’t find a workflow matching "${requestedName}". No execution was attempted.`)); return task; }
    task.target = { tool: 'n8n', resource: candidates[0].name, id: candidates[0].id };
    task.authorizationRequired = true;
    this.store.transition(task, 'AUTHORIZE', friendlyPlan(`I found "${candidates[0].name}". I need your explicit go-ahead before I run it.`));
    return task;
  }
  async authorize(id: string, approved: boolean): Promise<FridayTask | undefined> {
    const task = this.store.get(id); if (!task) return undefined;
    if (task.phase !== 'AUTHORIZE') return task;
    if (!approved) { this.fail(task, 'Got it — authorization was denied, so I did not run anything.'); return task; }
    task.authorizationGranted = true;
    this.store.transition(task, 'EXECUTE', `You gave the go-ahead. Running "${task.target?.resource}" now.`);
    const workflow = await this.tools.n8n.getWorkflow(task.target!.id!);
    if (!workflow.ok || !workflow.data) { this.fail(task, friendlyFailure(`I couldn’t retrieve the workflow before execution: ${workflow.error}`)); return task; }
    const execution = await this.tools.n8n.executeWorkflow(workflow.data, { source: 'friday', taskId: task.id, command: task.command, requestedAt: task.createdAt });
    this.store.transition(task, 'INSPECT', execution.ok ? 'The webhook responded. I’m checking what that actually proves.' : `Execution failed: ${execution.error}`);
    if (!execution.ok) { task.result = { success: false, summary: execution.error || 'Workflow execution failed.', verification: 'failed', data: execution.data }; this.store.transition(task, 'FAILED', task.result.summary); return task; }
    const verified = execution.status !== undefined && execution.status >= 200 && execution.status < 300;
    task.result = { success: false, summary: verified ? `Webhook accepted the request (HTTP ${execution.status}), but n8n completion cannot be verified without an execution ID.` : 'Workflow response was not successful.', verification: verified ? 'inconclusive' : 'failed', data: execution.data };
    this.store.transition(task, 'VERIFY', task.result.summary);
    this.store.transition(task, 'COMPLETE', 'The request finished, but the workflow completion is still unverified. I’m not calling that a win yet.');
    return task;
  }
  private fail(task: FridayTask, message: string) { task.result = { success: false, summary: message, verification: 'failed' }; this.store.transition(task, 'FAILED', message); }
}
function extractWorkflows(data: any): Array<{ id: string; name: string }> { const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []; return rows.filter((item: any) => typeof item?.id === 'string' && typeof item?.name === 'string'); }
