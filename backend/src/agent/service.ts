import { AiService } from "../ai/service.js";
import type { ChatMessage, ToolCall, ToolResult } from "../ai/types.js";
import { createDefaultToolRegistry } from "../tools/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { TaskEventRepository } from "../tasks/task-events.js";
import type { AgentRequest, AgentResult } from "./types.js";

const DEFAULT_MAX_STEPS = 8;

export class AgentService {
  constructor(
    private readonly aiService = new AiService(),
    private readonly registry: ToolRegistry = createDefaultToolRegistry(),
    private readonly events = new TaskEventRepository()
  ) {}

  async run(request: AgentRequest): Promise<AgentResult> {
    const maxSteps = request.maxSteps ?? DEFAULT_MAX_STEPS;
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 20) {
      throw new Error("maxSteps must be an integer between 1 and 20.");
    }

    const messages: ChatMessage[] = [...request.messages];
    const toolCalls: ToolCall[] = [];
    const toolResults: ToolResult[] = [];

    for (let step = 1; step <= maxSteps; step += 1) {
      if (request.taskId) await this.events.append(request.taskId, "agent.step.started", { step, maxSteps });

      const response = await this.aiService.generate({
        messages,
        model: request.model,
        temperature: request.temperature,
        tools: this.registry.list().map(tool => tool.definition)
      });

      messages.push({
        role: "assistant",
        content: response.text,
        ...(response.toolCalls.length > 0 ? { toolCalls: response.toolCalls } : {})
      });

      if (response.toolCalls.length === 0) {
        if (request.taskId) await this.events.append(request.taskId, "agent.completed", { step });
        return {
          text: response.text,
          model: response.model,
          provider: response.provider,
          steps: step,
          toolCalls,
          toolResults
        };
      }

      for (const call of response.toolCalls) {
        toolCalls.push(call);
        if (request.taskId) {
          await this.events.append(request.taskId, "agent.tool.started", {
            step,
            toolCallId: call.id,
            name: call.name
          });
        }

        try {
          const result = await this.registry.execute(call.name, call.input, {
            taskId: request.taskId,
            userId: request.userId
          });
          const toolResult: ToolResult = { toolCallId: call.id, name: call.name, result };
          toolResults.push(toolResult);
          messages.push({ role: "tool", content: JSON.stringify(toolResult), toolResult });
          if (request.taskId) {
            await this.events.append(request.taskId, "agent.tool.completed", {
              step,
              toolCallId: call.id,
              name: call.name
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const toolResult: ToolResult = { toolCallId: call.id, name: call.name, error: message };
          toolResults.push(toolResult);
          messages.push({ role: "tool", content: JSON.stringify(toolResult), toolResult });
          if (request.taskId) {
            await this.events.append(request.taskId, "agent.tool.failed", {
              step,
              toolCallId: call.id,
              name: call.name,
              error: message
            });
          }
        }
      }
    }

    if (request.taskId) await this.events.append(request.taskId, "agent.max_steps", { maxSteps });
    throw new Error(`Agent reached the maximum step limit of ${maxSteps}.`);
  }
}
