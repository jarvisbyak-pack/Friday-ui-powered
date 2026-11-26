export type Conversation = {
  id: string;
  title?: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredMessage = {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  metadata?: unknown;
  createdAt: string;
};

export type Memory = {
  id: string;
  userId?: string;
  conversationId?: string;
  kind: string;
  content: string;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
};
