import { GitHubClient } from "../github/client.js";
import type { Tool } from "./types.js";

const client = new GitHubClient();

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Tool input must be an object.");
  }
  return input as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, name: string): string {
  const value = input[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

export const githubListRepositoriesTool: Tool = {
  definition: {
    name: "github.list_repositories",
    description: "List repositories accessible to the configured GitHub account.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
      additionalProperties: false
    }
  },
  async execute(input) {
    const value = objectInput(input);
    return client.listRepositories(typeof value.limit === "number" ? value.limit : 20);
  }
};

export const githubGetFileTool: Tool = {
  definition: {
    name: "github.get_file",
    description: "Read a file or directory from a GitHub repository.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        path: { type: "string" },
        ref: { type: "string" }
      },
      required: ["repo", "path"],
      additionalProperties: false
    }
  },
  async execute(input) {
    const value = objectInput(input);
    return client.getFile(requiredString(value, "repo"), requiredString(value, "path"), typeof value.ref === "string" ? value.ref : undefined);
  }
};

export const githubSearchCodeTool: Tool = {
  definition: {
    name: "github.search_code",
    description: "Search indexed code in a specific GitHub repository.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 }
      },
      required: ["repo", "query"],
      additionalProperties: false
    }
  },
  async execute(input) {
    const value = objectInput(input);
    return client.searchCode(requiredString(value, "repo"), requiredString(value, "query"), typeof value.limit === "number" ? value.limit : 20);
  }
};

export const githubCreateBranchTool: Tool = {
  definition: {
    name: "github.create_branch",
    description: "Create a GitHub branch. This is a mutation and requires explicit mutation enablement.",
    inputSchema: {
      type: "object",
      properties: { repo: { type: "string" }, branch: { type: "string" }, base: { type: "string" } },
      required: ["repo", "branch"],
      additionalProperties: false
    }
  },
  async execute(input) {
    const value = objectInput(input);
    return client.createBranch(requiredString(value, "repo"), requiredString(value, "branch"), typeof value.base === "string" ? value.base : undefined);
  }
};

export const githubUpsertFileTool: Tool = {
  definition: {
    name: "github.upsert_file",
    description: "Create or update a text file in a GitHub branch. Mutation is disabled unless explicitly enabled.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
        branch: { type: "string" },
        message: { type: "string" },
        sha: { type: "string" }
      },
      required: ["repo", "path", "content", "branch", "message"],
      additionalProperties: false
    }
  },
  async execute(input) {
    const value = objectInput(input);
    return client.upsertFile(
      requiredString(value, "repo"),
      requiredString(value, "path"),
      requiredString(value, "content"),
      requiredString(value, "branch"),
      requiredString(value, "message"),
      typeof value.sha === "string" ? value.sha : undefined
    );
  }
};

export const githubCreatePullRequestTool: Tool = {
  definition: {
    name: "github.create_pull_request",
    description: "Create a GitHub pull request. Mutation is disabled unless explicitly enabled.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        head: { type: "string" },
        base: { type: "string" },
        title: { type: "string" },
        body: { type: "string" }
      },
      required: ["repo", "head", "base", "title"],
      additionalProperties: false
    }
  },
  async execute(input) {
    const value = objectInput(input);
    return client.createPullRequest(
      requiredString(value, "repo"),
      requiredString(value, "head"),
      requiredString(value, "base"),
      requiredString(value, "title"),
      typeof value.body === "string" ? value.body : undefined
    );
  }
};
