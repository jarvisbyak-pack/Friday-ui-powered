import type { FridayBrain } from '../brain/FridayBrain';
import { addTaskEvent, updateTask, getTask } from './persistence';

type QueueItem = { id: string; userId: string; command: string; payload?: any };
let brain: FridayBrain | null = null;
const queue: QueueItem[] = [];
let running = false;

export function configureTaskWorker(instance: FridayBrain) { brain = instance; }

export function enqueueTask(item: QueueItem) {
  queue.push(item);
  void drain();
}

async function drain() {
  if (running || !brain) return;
  running = true;
  try {
    while (queue.length) {
      const item = queue.shift()!;
      const stored = getTask(item.id, item.userId);
      if (!stored) continue;
      updateTask(item.id, { status: 'UNDERSTANDING' });
      addTaskEvent(item.id, 'UNDERSTAND', 'Friday Brain started processing the web task.');
      try {
        const p = item.payload || {};
        const result = await brain.execute({
          sessionId: String(p.sessionId || item.id),
          userInput: item.command,
          inputMode: p.inputMode === 'voice' ? 'voice' : 'text',
          activeNodeConfig: p.activeNodeConfig,
          customPayload: p.customBody || {},
          systemPrompt: p.systemPrompt || '',
          conversationHistory: Array.isArray(p.conversationHistory) ? p.conversationHistory : [],
          permissionsGranted: Array.isArray(p.permissionsGranted) ? p.permissionsGranted : [],
          maxReplans: Number.isFinite(p.maxReplans) ? p.maxReplans : 3,
        });
        const status = result.status === 'COMPLETED' ? 'COMPLETED' : result.status === 'WAITING_FOR_PERMISSION' ? 'WAITING_FOR_PERMISSION' : result.status === 'FAILED' ? 'FAILED' : 'RUNNING';
        updateTask(item.id, { status, result });
        addTaskEvent(item.id, status, result.finalResponse?.text || 'Friday Brain updated the task.');
      } catch (error: any) {
        updateTask(item.id, { status: 'FAILED', result: { error: error?.message || 'Unknown worker error' } });
        addTaskEvent(item.id, 'FAILED', error?.message || 'Web task execution failed.');
      }
    }
  } finally { running = false; }
}
