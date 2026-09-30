import { evaluateAuthorization } from './authorization';

const cases = [
  ['list my repositories', 'allowed'],
  ['inspect the workflow logs', 'allowed'],
  ['delete the production repository', 'approval_required'],
  ['deploy the current branch', 'approval_required'],
  ['change the GitHub workflow', 'approval_required'],
  ['update the Friday system', 'approval_required'],
] as const;

for (const [command, expected] of cases) {
  const actual = evaluateAuthorization(command).decision;
  if (actual !== expected) {
    throw new Error(`Authorization test failed for "${command}": expected ${expected}, got ${actual}`);
  }
}

console.log(`Authorization policy tests passed: ${cases.length}/${cases.length}`);
