import type { BaseTool } from "../tools/base-tool";

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(
        `[ToolRegistry] Tool ${tool.name} already registered, overwriting`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  registerMultiple(tools: BaseTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  getByTags(tags: string[]): BaseTool[] {
    return this.getAll().filter((tool) => tool.hasTags(tags));
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  clear(): void {
    this.tools.clear();
  }

  count(): number {
    return this.tools.size;
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
