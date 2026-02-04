import type { z } from "zod";

export interface ToolConfig {
  name: string;
  description: string;
  schema: z.ZodSchema;
  tags?: string[];
  requiresAuth?: boolean;
}

export interface ToolExecutionContext {
  sessionId: string;
  organizationId: string;
  userId: string;
}

export type ToolFunction<TInput, TOutput> = (
  input: TInput,
  context: ToolExecutionContext,
) => Promise<TOutput>;
