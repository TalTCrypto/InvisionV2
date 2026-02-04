import type { PrismaClient } from "../../../../../generated/prisma";
import type { Composio } from "@composio/core";
import {
  OrchestratorAgent,
  type OrchestratorConfig,
} from "./orchestrator.agent";
import { ContentAgent, type ContentAgentConfig } from "./content.agent";
import {
  PerformanceAgent,
  type PerformanceAgentConfig,
} from "./performance.agent";
import { StrategyAgent, type StrategyAgentConfig } from "./strategy.agent";
import type { DocumentProcessor } from "~/server/services/langchain-processor";
import type { InstagramReelAnalyzer } from "~/server/utils/instagram-analyzer";
import type { YouTubeAnalyzer } from "~/server/utils/youtube-analyzer";

export interface AgentFactoryConfig {
  db: PrismaClient;
  documentProcessor: DocumentProcessor;
  instagramAnalyzer: InstagramReelAnalyzer;
  youtubeAnalyzer: YouTubeAnalyzer;
  composioClient: Composio;
}

export type AgentType = "orchestrator" | "content" | "performance" | "strategy";

export type Agent =
  | OrchestratorAgent
  | ContentAgent
  | PerformanceAgent
  | StrategyAgent;

export interface AgentOptions {
  sessionId: string;
  organizationId?: string;
  userId?: string;
}

export class AgentFactory {
  constructor(private config: AgentFactoryConfig) {}

  async createAgent(type: AgentType, _options: AgentOptions): Promise<Agent> {
    switch (type) {
      case "orchestrator":
        return this.createOrchestrator();
      case "content":
        return this.createContentAgent();
      case "performance":
        return this.createPerformanceAgent();
      case "strategy":
        return this.createStrategyAgent();
      default:
        throw new Error(`Unknown agent type: ${type as string}`);
    }
  }

  private createOrchestrator(): OrchestratorAgent {
    const config: OrchestratorConfig = {
      db: this.config.db,
      documentProcessor: this.config.documentProcessor,
      instagramAnalyzer: this.config.instagramAnalyzer,
      youtubeAnalyzer: this.config.youtubeAnalyzer,
      composioClient: this.config.composioClient,
    };

    return new OrchestratorAgent(config);
  }

  private createContentAgent(): ContentAgent {
    const config: ContentAgentConfig = {
      db: this.config.db,
      documentProcessor: this.config.documentProcessor,
      instagramAnalyzer: this.config.instagramAnalyzer,
      youtubeAnalyzer: this.config.youtubeAnalyzer,
      composioClient: this.config.composioClient,
    };

    return new ContentAgent(config);
  }

  private createPerformanceAgent(): PerformanceAgent {
    const config: PerformanceAgentConfig = {
      db: this.config.db,
      documentProcessor: this.config.documentProcessor,
      instagramAnalyzer: this.config.instagramAnalyzer,
      youtubeAnalyzer: this.config.youtubeAnalyzer,
      composioClient: this.config.composioClient,
    };

    return new PerformanceAgent(config);
  }

  private createStrategyAgent(): StrategyAgent {
    const config: StrategyAgentConfig = {
      db: this.config.db,
      documentProcessor: this.config.documentProcessor,
      instagramAnalyzer: this.config.instagramAnalyzer,
      youtubeAnalyzer: this.config.youtubeAnalyzer,
      composioClient: this.config.composioClient,
    };

    return new StrategyAgent(config);
  }

  getAvailableAgentTypes(): AgentType[] {
    return ["orchestrator", "content", "performance", "strategy"];
  }

  /**
   * Recommande le meilleur agent basé sur le message de l'utilisateur
   */
  recommendAgent(userMessage: string): AgentType {
    const message = userMessage.toLowerCase();

    // Keywords pour ContentAgent
    if (
      message.includes("hook") ||
      message.includes("script") ||
      message.includes("copywriting") ||
      message.includes("cta") ||
      message.includes("viral") ||
      message.includes("storytelling") ||
      message.includes("écrire") ||
      message.includes("rédiger") ||
      message.includes("contenu")
    ) {
      return "content";
    }

    // Keywords pour PerformanceAgent
    if (
      message.includes("analyse") ||
      message.includes("métrique") ||
      message.includes("kpi") ||
      message.includes("performance") ||
      message.includes("optimiser") ||
      message.includes("rétention") ||
      message.includes("engagement") ||
      message.includes("statistique")
    ) {
      return "performance";
    }

    // Keywords pour StrategyAgent
    if (
      message.includes("stratégie") ||
      message.includes("planning") ||
      message.includes("calendrier") ||
      message.includes("roadmap") ||
      message.includes("croissance") ||
      message.includes("audience") ||
      message.includes("positionnement")
    ) {
      return "strategy";
    }

    // Default: orchestrator (peut router vers d'autres agents)
    return "orchestrator";
  }
}
