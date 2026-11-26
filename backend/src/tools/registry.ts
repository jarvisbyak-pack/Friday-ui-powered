import type { Tool, ToolExecutionContext } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool already registered: ${tool.definition.name}`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, input: unknown, context: ToolExecutionContext): Promise<unknown> {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.execute(input, context);
  }
}
