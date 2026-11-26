import { pool } from "../db/pool.js";
import type { Conversation, Memory, StoredMessage } from "./types.js";

type ConversationRow = {
  id: string;
  title: string | null;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: StoredMessage["role"];
  content: string;
  metadata: unknown;
  created_at: Date;
};

type MemoryRow = {
  id: string;
  user_id: string | null;
  conversation_id: string | null;
  kind: string;
  content: string;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
};

const optional = (value: string | null): { userId?: string } =>
  value === null ? {} : { userId: value };

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title ?? undefined,
    ...optional(row.user_id),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    ...(row.metadata === null ? {} : { metadata: row.metadata }),
    createdAt: row.created_at.toISOString()
  };
}

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    ...(row.user_id === null ? {} : { userId: row.user_id }),
    ...(row.conversation_id === null ? {} : { conversationId: row.conversation_id }),
    kind: row.kind,
    content: row.content,
    ...(row.metadata === null ? {} : { metadata: row.metadata }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class ConversationRepository {
  async create(title?: string, userId?: string): Promise<Conversation> {
    const { rows } = await pool.query<ConversationRow>(
      `INSERT INTO conversations (title, user_id)
       VALUES ($1, $2)
       RETURNING id, title, user_id, created_at, updated_at`,
      [title ?? null, userId ?? null]
    );
    return toConversation(rows[0]!);
  }

  async list(userId?: string, limit = 50): Promise<Conversation[]> {
    const { rows } = await pool.query<ConversationRow>(
      `SELECT id, title, user_id, created_at, updated_at
       FROM conversations
       WHERE ($1::uuid IS NULL OR user_id = $1)
       ORDER BY updated_at DESC
       LIMIT $2`,
      [userId ?? null, limit]
    );
    return rows.map(toConversation);
  }

  async get(id: string): Promise<Conversation | undefined> {
    const { rows } = await pool.query<ConversationRow>(
      `SELECT id, title, user_id, created_at, updated_at
       FROM conversations WHERE id = $1`,
      [id]
    );
    return rows[0] ? toConversation(rows[0]) : undefined;
  }

  async addMessage(
    conversationId: string,
    role: StoredMessage["role"],
    content: string,
    metadata?: unknown
  ): Promise<StoredMessage> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<MessageRow>(
        `INSERT INTO messages (conversation_id, role, content, metadata)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id, conversation_id, role, content, metadata, created_at`,
        [conversationId, role, content, JSON.stringify(metadata ?? null)]
      );
      await client.query(
        "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
        [conversationId]
      );
      await client.query("COMMIT");
      return toMessage(rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listMessages(conversationId: string, limit = 200): Promise<StoredMessage[]> {
    const { rows } = await pool.query<MessageRow>(
      `SELECT id, conversation_id, role, content, metadata, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [conversationId, limit]
    );
    return rows.map(toMessage);
  }

  async addMemory(input: {
    userId?: string;
    conversationId?: string;
    kind?: string;
    content: string;
    metadata?: unknown;
  }): Promise<Memory> {
    const { rows } = await pool.query<MemoryRow>(
      `INSERT INTO memories (user_id, conversation_id, kind, content, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, user_id, conversation_id, kind, content, metadata, created_at, updated_at`,
      [
        input.userId ?? null,
        input.conversationId ?? null,
        input.kind ?? "fact",
        input.content,
        JSON.stringify(input.metadata ?? null)
      ]
    );
    return toMemory(rows[0]!);
  }

  async searchMemories(query: string, userId?: string, limit = 20): Promise<Memory[]> {
    const { rows } = await pool.query<MemoryRow>(
      `SELECT id, user_id, conversation_id, kind, content, metadata, created_at, updated_at
       FROM memories
       WHERE ($1::uuid IS NULL OR user_id = $1)
         AND content ILIKE '%' || $2 || '%'
       ORDER BY updated_at DESC
       LIMIT $3`,
      [userId ?? null, query, limit]
    );
    return rows.map(toMemory);
  }
}
