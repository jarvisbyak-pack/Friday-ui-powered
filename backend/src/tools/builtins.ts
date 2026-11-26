import type { Tool } from "./types.js";

export const systemStatusTool: Tool = {
  definition: {
    name: "system.status",
    description: "Return a safe status snapshot of the Friday backend.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  async execute() {
    return {
      service: "friday-backend",
      status: "online",
      timestamp: new Date().toISOString()
    };
  }
};

export const echoTool: Tool = {
  definition: {
    name: "echo",
    description: "Echo a supplied value back to the agent. Use only for testing tool execution.",
    inputSchema: {
      type: "object",
      properties: {
        value: {}
      },
      required: ["value"],
      additionalProperties: false
    }
  },
  async execute(input) {
    if (!input || typeof input !== "object" || !("value" in input)) {
      throw new Error("echo requires an object with a value property.");
    }
    return { value: (input as { value: unknown }).value };
  }
};
