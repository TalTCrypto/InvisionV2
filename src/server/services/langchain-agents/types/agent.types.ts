import type { BaseTool } from "../tools/base-tool";
import type { MemoryStrategy } from "./memory.types";

export type LLMModel = "gpt-4o" | "gpt-4o-mini" | "claude-sonnet-4.5";

export interface AgentConfig {
  name: string;
  description: string;
  model: LLMModel;
  temperature: number;
  maxTokens?: number;
  systemPrompt: string;
  tools: BaseTool[];
  memory?: MemoryStrategy;
  streaming: boolean;
}

export interface AgentExecutionContext {
  sessionId: string;
  organizationId: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResponse {
  output: string;
  reasoning: ReasoningStep[];
  toolsUsed: ToolExecution[];
  tokensUsed: number;
  duration: number;
}

export interface ReasoningStep {
  step: number;
  thought: string;
  action?: string;
  actionInput?: unknown;
  observation?: string;
  timestamp: number;
}

export interface ToolExecution {
  toolName: string;
  input: unknown;
  output: unknown;
  duration: number;
  success: boolean;
  error?: string;
}
