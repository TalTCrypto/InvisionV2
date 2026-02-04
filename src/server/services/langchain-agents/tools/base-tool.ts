import { DynamicStructuredTool } from "@langchain/core/tools";
import type { z } from "zod";
import type { ToolExecutionContext } from "../types";

export abstract class BaseTool<TInput = unknown, TOutput = unknown> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: z.ZodSchema<TInput>;
  abstract readonly tags: string[];

  protected context?: ToolExecutionContext;

  abstract execute(
    input: TInput,
    context: ToolExecutionContext,
  ): Promise<TOutput>;

  setContext(context: ToolExecutionContext): void {
    this.context = context;
  }

  toLangChainTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: this.name,
      description: this.description,
      schema: this.schema,
      func: async (input: unknown) => {
        if (!this.context) {
          throw new Error(
            `Tool ${this.name} called without context. Call setContext() first.`,
          );
        }

        try {
          const validatedInput = this.validateInput(input);
          const result = await this.execute(validatedInput, this.context);
          return JSON.stringify(result);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`[Tool:${this.name}] Error:`, errorMessage);
          return JSON.stringify({
            error: errorMessage,
            success: false,
          });
        }
      },
    });
  }

  protected validateInput(input: unknown): TInput {
    return this.schema.parse(input);
  }

  hasTags(tags: string[]): boolean {
    return tags.some((tag) => this.tags.includes(tag));
  }
}
