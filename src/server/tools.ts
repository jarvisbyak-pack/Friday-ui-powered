import { ToolDefinition } from './contracts';
import { N8nService } from './n8n';

export class ToolRegistry {
  readonly definitions: ToolDefinition[] = [
    { id: 'n8n', displayName: 'n8n workflow automation', permissions: ['read', 'execute', 'mutate'] },
  ];
  constructor(readonly n8n = new N8nService()) {}
  status() { return this.definitions.map((tool) => ({ ...tool, configured: tool.id === 'n8n' ? this.n8n.isConfigured() : false })); }
}
