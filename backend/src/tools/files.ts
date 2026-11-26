import { FileService } from "../files/service.js";
import type { Tool } from "./types.js";

const files = new FileService();

function inputObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tool input must be an object.");
  return input as Record<string, unknown>;
}

function stringValue(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string.`);
  return value.trim();
}

export const fileListTool: Tool = {
  definition: {
    name: "files.list",
    description: "List files belonging to the authenticated Friday user.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
      additionalProperties: false
    }
  },
  async execute(input, context) {
    if (!context.userId) throw new Error("Authenticated user context is required.");
    const value = inputObject(input);
    return files.list(context.userId, typeof value.limit === "number" ? value.limit : 100);
  }
};

export const fileReadTool: Tool = {
  definition: {
    name: "files.read",
    description: "Read the contents of a stored user file as UTF-8 text. Use only for text-readable files.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false
    }
  },
  async execute(input, context) {
    if (!context.userId) throw new Error("Authenticated user context is required.");
    const value = inputObject(input);
    const result = await files.read(context.userId, stringValue(value, "id"));
    if (!result) throw new Error("File not found.");
    if (result.content.includes(0)) throw new Error("Binary files cannot be read as text.");
    return {
      file: result.file,
      content: result.content.toString("utf8")
    };
  }
};
