import { PermissionLevel } from './contracts';

const value = (name: string) => process.env[name]?.trim() || undefined;

export interface N8nConfig {
  baseUrl?: string; apiKey?: string; webhookUrls: Record<string, string>;
  allowMutations: boolean;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: value('FRIDAY_DATA_DIR') || 'data',
  defaultProvider: value('FRIDAY_DEFAULT_PROVIDER') || 'gemini',
  geminiApiKey: value('GEMINI_API_KEY'),
  n8n: {
    baseUrl: value('N8N_BASE_URL')?.replace(/\/$/, ''),
    apiKey: value('N8N_API_KEY'),
    webhookUrls: parseWebhookMap(value('N8N_WORKFLOW_WEBHOOKS_JSON')),
    allowMutations: value('FRIDAY_ALLOW_N8N_MUTATIONS') === 'true',
  } satisfies N8nConfig,
};

function parseWebhookMap(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function canUsePermission(permission: PermissionLevel, authorizationGranted: boolean): boolean {
  return permission === 'read' || authorizationGranted;
}
