import type { ChatMessage, ToolCall, ToolResult } from "../ai/types.js";

export interface AgentRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxSteps?: number;
  taskId?: string;
  userId?: string;
}

export interface AgentResult {
  text: string;
  model: string;
  provider: string;
  steps: number;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
}
