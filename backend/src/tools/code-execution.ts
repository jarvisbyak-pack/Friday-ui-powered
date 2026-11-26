import { CodeExecutionService } from "../code-execution/service.js";
import type { Tool } from "./types.js";

const execution = new CodeExecutionService();

export const codeRunTool: Tool = {
  definition: {
    name: "code.run",
    description: "Run one explicitly allowlisted development command inside the configured workspace.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "array", items: { type: "string" }, minItems: 1 },
        cwd: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1000 }
      },
      required: ["command"],
      additionalProperties: false
    }
  },
  async execute(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Tool input must be an object.");
    }
    const value = input as Record<string, unknown>;
    if (!Array.isArray(value.command) || value.command.some(item => typeof item !== "string")) {
      throw new Error("command must be an array of strings.");
    }
    return execution.run(
      value.command as string[],
      typeof value.cwd === "string" ? value.cwd : undefined,
      typeof value.timeoutMs === "number" ? value.timeoutMs : undefined
    );
  }
};
