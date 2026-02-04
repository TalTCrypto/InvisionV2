import type { PrismaClient } from "../../../../../generated/prisma";
import type { Composio } from "@composio/core";
import type {
  AgentResponse,
  AgentExecutionContext,
  MemoryStrategy,
} from "../types";
import { AgentExecutor } from "../core/agent-executor";
import { ToolRegistry } from "../core/tool-registry";
import { ConversationMemory } from "../memory/conversation-memory";
import { ContextManager } from "../core/context-manager";
import { ResourceSearchTool } from "../tools/resource-search.tool";
import { InstagramAnalysisTool } from "../tools/instagram-analysis.tool";
import { YouTubeAnalysisTool } from "../tools/youtube-analysis.tool";
import {
  ComposioToolLoader,
  type ConnectedIntegration,
} from "../tools/composio.tool-loader";
import { STRATEGY_AGENT_PROMPT } from "../prompts/system-prompts";
import type { DocumentProcessor } from "~/server/services/langchain-processor";
import type { InstagramReelAnalyzer } from "~/server/utils/instagram-analyzer";
import type { YouTubeAnalyzer } from "~/server/utils/youtube-analyzer";

export interface StrategyAgentConfig {
  db: PrismaClient;
  documentProcessor: DocumentProcessor;
  instagramAnalyzer: InstagramReelAnalyzer;
  youtubeAnalyzer: YouTubeAnalyzer;
  composioClient: Composio;
}

/**
 * StrategyAgent - Expert en stratégie marketing
 *
 * Spécialisé dans:
 * - Content strategy
 * - Growth strategy
 * - Audience targeting
 * - Brand building
 * - Content planning
 */
export class StrategyAgent {
  private executor!: AgentExecutor;
  private memory: ConversationMemory;
  private contextManager: ContextManager;
  private toolRegistry: ToolRegistry;
  private connectedIntegrations: ConnectedIntegration[] = [];

  constructor(private config: StrategyAgentConfig) {
    const memoryStrategy: MemoryStrategy = {
      maxTokens: 8000,
      compressionThreshold: 6000,
      compressionStrategy: "hybrid",
    };

    this.memory = new ConversationMemory(config.db, memoryStrategy);
    this.contextManager = new ContextManager(8000, 6000);
    this.toolRegistry = new ToolRegistry();

    this.setupTools();
  }

  private setupTools(): void {
    this.toolRegistry.register(
      new ResourceSearchTool(this.config.documentProcessor, this.config.db),
    );

    this.toolRegistry.register(
      new InstagramAnalysisTool(this.config.instagramAnalyzer),
    );

    this.toolRegistry.register(
      new YouTubeAnalysisTool(this.config.youtubeAnalyzer),
    );
  }

  private async initComposio(context: AgentExecutionContext): Promise<void> {
    const composioUserId = context.userId;
    const loader = new ComposioToolLoader(this.config.composioClient);

    this.connectedIntegrations =
      await loader.getConnectedIntegrations(composioUserId);
    const composioTools = await loader.loadToolsForUser(composioUserId);
    this.toolRegistry.registerMultiple(composioTools);

    this.executor = new AgentExecutor(
      "gpt-4o-mini",
      this.toolRegistry.getAll(),
      STRATEGY_AGENT_PROMPT,
      this.memory,
      10,
      0.4,
      this.connectedIntegrations,
    );
  }

  async execute(
    input: string,
    context: AgentExecutionContext,
  ): Promise<AgentResponse> {
    await this.initComposio(context);
    return await this.executor.execute(input, context);
  }

  async *stream(
    input: string,
    context: AgentExecutionContext,
  ): AsyncGenerator<{
    type: "token" | "message" | "tool" | "clear" | "end";
    data: unknown;
  }> {
    await this.initComposio(context);
    yield* this.executor.stream(input, context);
  }

  getAvailableTools(): string[] {
    return this.toolRegistry.listNames();
  }

  getToolsByCategory(category: string): string[] {
    return this.toolRegistry.getByTags([category]).map((tool) => tool.name);
  }
}
