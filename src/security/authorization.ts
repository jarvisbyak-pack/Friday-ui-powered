export type AuthorizationDecision = 'allowed' | 'approval_required' | 'blocked';

export interface AuthorizationResult {
  decision: AuthorizationDecision;
  reason: string;
  risk: 'low' | 'high';
  approvalScope?: string;
}

const HIGH_IMPACT_PATTERNS: Array<{ pattern: RegExp; scope: string }> = [
  { pattern: /\b(deploy|production deploy|publish|release|rollback)\b/i, scope: 'deployment or release' },
  { pattern: /\b(delete|remove|drop|destroy|wipe|reset)\b/i, scope: 'destructive change' },
  { pattern: /\b(create|edit|modify|update|change|rename|move|overwrite|replace)\b.{0,80}\b(repo|repository|branch|file|workflow|github|code)\b/i, scope: 'repository or code change' },
  { pattern: /\b(push|commit|merge|pull request|pr)\b/i, scope: 'GitHub write operation' },
  { pattern: /\b(activate|deactivate|enable|disable|execute|run)\b.{0,80}\b(workflow|automation|job|migration|script)\b/i, scope: 'workflow or execution change' },
  { pattern: /\b(migrate|migration|schema|database|db)\b.{0,80}\b(change|update|alter|reset|drop|delete|run)\b/i, scope: 'database change' },
  { pattern: /\b(api key|token|credential|secret|permission|access)\b.{0,80}\b(change|update|replace|rotate|grant|revoke)\b/i, scope: 'security or access change' },
  { pattern: /\b(change|update|replace|edit|modify)\b.{0,80}\b(webhook|url|endpoint|website|external system)\b/i, scope: 'external-system configuration change' },
  { pattern: /\b(friday)\b.{0,100}\b(change|modify|edit|update|reset|rebuild|replace|disable|delete|deploy)\b/i, scope: 'Friday system change' },
];

export function evaluateAuthorization(command: string): AuthorizationResult {
  const normalized = command.trim();
  if (!normalized) {
    return { decision: 'allowed', reason: 'Empty command.', risk: 'low' };
  }

  for (const rule of HIGH_IMPACT_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      return {
        decision: 'approval_required',
        reason: 'This request may make a high-impact change and requires human approval before execution.',
        risk: 'high',
        approvalScope: rule.scope,
      };
    }
  }

  return {
    decision: 'allowed',
    reason: 'No high-impact mutation pattern was detected.',
    risk: 'low',
  };
}

export function isApprovalValid(
  approval: { command: string; scope: string } | null,
  command: string,
  scope: string,
): boolean {
  return Boolean(
    approval &&
      approval.command === command.trim() &&
      approval.scope === scope,
  );
}
