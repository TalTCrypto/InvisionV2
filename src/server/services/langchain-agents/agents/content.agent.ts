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
import { CONTENT_AGENT_PROMPT } from "../prompts/system-prompts";
import type { DocumentProcessor } from "~/server/services/langchain-processor";
import type { InstagramReelAnalyzer } from "~/server/utils/instagram-analyzer";
import type { YouTubeAnalyzer } from "~/server/utils/youtube-analyzer";
import {
  fetchResourceContext,
  formatResourcesForPrompt,
} from "~/server/utils/resource-context";

export interface ContentAgentConfig {
  db: PrismaClient;
  documentProcessor: DocumentProcessor;
  instagramAnalyzer: InstagramReelAnalyzer;
  youtubeAnalyzer: YouTubeAnalyzer;
  composioClient: Composio;
}

/**
 * ContentAgent - Expert en création de contenu viral
 *
 * Spécialisé dans:
 * - Hooks puissants
 * - Storytelling
 * - Formats viraux
 * - Copywriting
 * - CTAs optimisés
 */
export class ContentAgent {
  private executor!: AgentExecutor;
  private memory: ConversationMemory;
  private contextManager: ContextManager;
  private toolRegistry: ToolRegistry;
  private connectedIntegrations: ConnectedIntegration[] = [];

  constructor(private config: ContentAgentConfig) {
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
  }

  private async buildSystemPrompt(
    userId: string,
    userInput: string,
    organizationId: string,
  ): Promise<string> {
    const snippets = await fetchResourceContext(
      userId,
      userInput,
      organizationId,
    );
    const resourceBlock = formatResourcesForPrompt(snippets);
    return resourceBlock
      ? CONTENT_AGENT_PROMPT + "\n\n" + resourceBlock
      : CONTENT_AGENT_PROMPT;
  }

  private createExecutor(systemPrompt: string): void {
    this.executor = new AgentExecutor(
      "gpt-4o-mini",
      this.toolRegistry.getAll(),
      systemPrompt,
      this.memory,
      this.config.db,
      8,
      0.7,
      this.connectedIntegrations,
    );
  }

  async execute(
    input: string,
    context: AgentExecutionContext,
  ): Promise<AgentResponse> {
    const [, systemPrompt] = await Promise.all([
      this.initComposio(context),
      this.buildSystemPrompt(context.userId, input, context.organizationId),
    ]);
    this.createExecutor(systemPrompt);
    return await this.executor.execute(input, context);
  }

  async *stream(
    input: string,
    context: AgentExecutionContext,
  ): AsyncGenerator<{
    type: "token" | "message" | "tool" | "clear" | "end";
    data: unknown;
  }> {
    const [, systemPrompt] = await Promise.all([
      this.initComposio(context),
      this.buildSystemPrompt(context.userId, input, context.organizationId),
    ]);
    this.createExecutor(systemPrompt);
    yield* this.executor.stream(input, context);
  }

  getAvailableTools(): string[] {
    return this.toolRegistry.listNames();
  }

  getToolsByCategory(category: string): string[] {
    return this.toolRegistry.getByTags([category]).map((tool) => tool.name);
  }
}
