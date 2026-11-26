import { WebSearchService } from "../web/search-service.js";
import type { Tool } from "./types.js";

const webSearch = new WebSearchService();

export const webSearchTool: Tool = {
  definition: {
    name: "web.search",
    description: "Search the public web and return a small set of normalized results with titles, URLs, descriptions, and optional page markdown.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 500 },
        limit: { type: "integer", minimum: 1, maximum: 10 },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 60000 }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  async execute(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Tool input must be an object.");
    }
    const value = input as Record<string, unknown>;
    if (typeof value.query !== "string" || !value.query.trim()) {
      throw new Error("query must be a non-empty string.");
    }

    return webSearch.search(
      value.query.trim(),
      typeof value.limit === "number" ? value.limit : undefined,
      typeof value.timeoutMs === "number" ? value.timeoutMs : undefined
    );
  }
};
