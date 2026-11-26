import { WebFetchService } from "../web/service.js";
import type { Tool } from "./types.js";

const web = new WebFetchService();

export const webFetchTool: Tool = {
  definition: {
    name: "web.fetch",
    description: "Fetch a public HTTP or HTTPS webpage as text. Read-only; private/local network targets are blocked.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 30000 }
      },
      required: ["url"],
      additionalProperties: false
    }
  },
  async execute(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tool input must be an object.");
    const value = input as Record<string, unknown>;
    if (typeof value.url !== "string" || !value.url.trim()) throw new Error("url must be a non-empty string.");
    return web.fetchText(value.url.trim(), typeof value.timeoutMs === "number" ? value.timeoutMs : undefined);
  }
};
