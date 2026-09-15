import fs from 'node:fs';
import path from 'node:path';

export type MemoryScope = 'user' | 'project' | 'sensitive';
export interface ProfileMemory { id: string; scope: MemoryScope; key: string; value: string; createdAt: string; updatedAt: string; }

/** Single-user development store. Sensitive values are never returned to the browser or model prompt. */
export class ProfileStore {
  private readonly file: string;
  private memories = new Map<string, ProfileMemory>();
  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'friday-profile.json'); fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(this.file)) try { for (const memory of JSON.parse(fs.readFileSync(this.file, 'utf8')) as ProfileMemory[]) this.memories.set(memory.id, memory); } catch { /* ignore corrupt local development profile */ }
  }
  listPublic() {
    return [...this.memories.values()].map((memory) => memory.scope === 'sensitive'
      ? { id: memory.id, scope: memory.scope, key: memory.key, hasValue: true, updatedAt: memory.updatedAt }
      : memory);
  }
  save(input: Pick<ProfileMemory, 'scope' | 'key' | 'value'>, confirmed: boolean) {
    if (!confirmed) throw new Error('Persistent memory requires explicit confirmation.');
    if (!['user', 'project', 'sensitive'].includes(input.scope)) throw new Error('Invalid memory scope.');
    if (!input.key.trim() || !input.value.trim()) throw new Error('A memory key and value are required.');
    const now = new Date().toISOString();
    const existing = [...this.memories.values()].find((item) => item.scope === input.scope && item.key.toLowerCase() === input.key.trim().toLowerCase());
    const memory: ProfileMemory = { id: existing?.id || crypto.randomUUID(), scope: input.scope, key: input.key.trim().slice(0, 120), value: input.value.trim().slice(0, 2000), createdAt: existing?.createdAt || now, updatedAt: now };
    this.memories.set(memory.id, memory); this.persist(); return memory.scope === 'sensitive' ? { id: memory.id, scope: memory.scope, key: memory.key, hasValue: true, updatedAt: memory.updatedAt } : memory;
  }
  remove(id: string) { const deleted = this.memories.delete(id); if (deleted) this.persist(); return deleted; }
  contextForPrompt() { return [...this.memories.values()].filter((item) => item.scope !== 'sensitive').map((item) => `${item.scope}.${item.key}: ${item.value}`).join('\n'); }
  private persist() { fs.writeFileSync(this.file, JSON.stringify([...this.memories.values()], null, 2), { encoding: 'utf8', mode: 0o600 }); }
}
