import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentService } from "../src/agent/service.js";
import { ToolRegistry } from "../src/tools/registry.js";
import type { Tool } from "../src/tools/types.js";
import type { AiProvider } from "../src/ai/types.js";
import { GitHubClient } from "../src/github/client.js";
import { CodeExecutionService } from "../src/code-execution/service.js";
import { WebFetchService } from "../src/web/service.js";

describe("Friday backend safety and agent seams", () => {
  it("runs an agent tool call and returns the final provider response", async () => {
    let calls = 0;
    const provider: AiProvider = {
      async generate(request) {
        calls += 1;
        if (calls === 1) {
          return {
            text: "",
            provider: "fake",
            model: "fake-model",
            toolCalls: [{ id: "tool-1", name: "echo", input: { value: "ok" } }]
          };
        }
        assert.ok(request.messages.some(message => message.role === "tool"));
        return { text: "done", provider: "fake", model: "fake-model", toolCalls: [] };
      }
    };

    const registry = new ToolRegistry();
    const echo: Tool = {
      definition: {
        name: "echo",
        description: "test echo",
        inputSchema: { type: "object" }
      },
      async execute(input) {
        return input;
      }
    };
    registry.register(echo);

    const result = await new AgentService(provider, registry).run({
      messages: [{ role: "user", content: "test" }]
    });

    assert.equal(result.text, "done");
    assert.equal(result.steps, 2);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolResults.length, 1);
  });

  it("fails closed for GitHub mutations by default", async () => {
    await assert.rejects(
      () => new GitHubClient().createBranch("example/repo", "test-branch"),
      /mutations are disabled/i
    );
  });

  it("fails closed for code execution by default", async () => {
    await assert.rejects(
      () => new CodeExecutionService().run(["npm", "test"]),
      /code execution is disabled/i
    );
  });

  it("blocks local web targets and redirects", async () => {
    await assert.rejects(
      () => new WebFetchService().fetchText("http://127.0.0.1:3000"),
      /local network|private/i
    );
  });
});
