export type TaskPhase = 'UNDERSTAND' | 'PLAN' | 'AUTHORIZE' | 'BUILD' | 'EXECUTE' | 'INSPECT' | 'VERIFY' | 'FIX' | 'RE_TEST' | 'COMPLETE' | 'FAILED';
export type PermissionLevel = 'read' | 'execute' | 'mutate';

export interface TaskEvent { at: string; phase: TaskPhase; message: string; details?: Record<string, unknown>; }
export interface FridayTask {
  id: string; command: string; phase: TaskPhase; createdAt: string; updatedAt: string;
  authorizationRequired: boolean; authorizationGranted: boolean; target?: { tool: string; resource?: string; id?: string };
  result?: { success: boolean; summary: string; verification: 'verified' | 'inconclusive' | 'failed'; data?: unknown };
  events: TaskEvent[];
}

export interface ModelRequest { system: string; input: string; }
export interface ModelResponse { provider: string; model: string; text: string; }
export interface ModelProvider { id: string; isConfigured(): boolean; generate(request: ModelRequest): Promise<ModelResponse>; }

export interface ToolResult<T = unknown> { ok: boolean; status?: number; data?: T; error?: string; }
export interface ToolDefinition { id: string; displayName: string; permissions: PermissionLevel[]; }
