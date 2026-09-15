import { config, N8nConfig } from './config';
import { ToolResult } from './contracts';

export interface N8nWorkflow { id: string; name: string; active?: boolean; [key: string]: unknown; }

/** Real n8n HTTP client. It never converts unavailable/configuration failures into success. */
export class N8nService {
  constructor(private readonly settings: N8nConfig = config.n8n) {}
  isConfigured() { return Boolean(this.settings.baseUrl); }
  async health(): Promise<ToolResult> { return this.request('/healthz'); }
  async listWorkflows(): Promise<ToolResult<N8nWorkflow[]>> { return this.request('/api/v1/workflows'); }
  async getWorkflow(id: string): Promise<ToolResult<N8nWorkflow>> { return this.request(`/api/v1/workflows/${encodeURIComponent(id)}`); }
  async listExecutions(workflowId?: string): Promise<ToolResult> { return this.request(`/api/v1/executions${workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : ''}`); }
  async getExecution(id: string): Promise<ToolResult> { return this.request(`/api/v1/executions/${encodeURIComponent(id)}`); }
  async executeWorkflow(workflow: N8nWorkflow, input: unknown): Promise<ToolResult> {
    const webhook = this.settings.webhookUrls[workflow.id] || this.settings.webhookUrls[workflow.name];
    if (!webhook) return { ok: false, error: `No configured webhook URL exists for workflow "${workflow.name}". Execution was not attempted.` };
    try { const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); return { ok: response.ok, status: response.status, data: redact(await parseBody(response)), error: response.ok ? undefined : `n8n webhook returned HTTP ${response.status}` }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Unable to call n8n webhook.' }; }
  }
  // These endpoints are deliberately gated by the orchestrator and FRIDAY_ALLOW_N8N_MUTATIONS.
  async createWorkflow(body: unknown) { return this.mutate('/api/v1/workflows', 'POST', body); }
  async updateWorkflow(id: string, body: unknown) { return this.mutate(`/api/v1/workflows/${encodeURIComponent(id)}`, 'PUT', body); }
  async setWorkflowActive(id: string, active: boolean) { return this.mutate(`/api/v1/workflows/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, 'POST'); }
  private async mutate(path: string, method: string, body?: unknown): Promise<ToolResult> { if (!this.settings.allowMutations) return { ok: false, error: 'n8n mutations are disabled. Set FRIDAY_ALLOW_N8N_MUTATIONS=true only after reviewing authorization policy.' }; return this.request(path, method, body); }
  private async request(path: string, method = 'GET', body?: unknown): Promise<ToolResult<any>> {
    if (!this.settings.baseUrl) return { ok: false, error: 'n8n is not configured. Set N8N_BASE_URL on the server.' };
    try { const response = await fetch(`${this.settings.baseUrl}${path}`, { method, headers: { Accept: 'application/json', ...(this.settings.apiKey ? { 'X-N8N-API-KEY': this.settings.apiKey } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { ok: response.ok, status: response.status, data: redact(await parseBody(response)), error: response.ok ? undefined : `n8n returned HTTP ${response.status}` }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Unable to contact n8n.' }; }
  }
}
async function parseBody(response: Response): Promise<unknown> { const text = await response.text(); try { return text ? JSON.parse(text) : null; } catch { return text; } }
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, /token|secret|password|authorization|api.?key|cookie/i.test(key) ? '[REDACTED]' : redact(item)]));
  return value;
}
