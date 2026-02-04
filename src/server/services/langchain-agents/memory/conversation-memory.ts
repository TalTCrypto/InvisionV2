import { ChatOpenAI } from "@langchain/openai";
import type { PrismaClient } from "@prisma/client";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type {
  ConversationMessage,
  MemoryStrategy,
  CompressionResult,
} from "../types";
import { tokenCounter } from "./token-counter";
import { env } from "~/env";

export class ConversationMemory {
  private llm: ChatOpenAI;

  constructor(
    private db: PrismaClient,
    private strategy: MemoryStrategy,
  ) {
    this.llm = new ChatOpenAI({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: "gpt-4o-mini",
      temperature: 0.1,
      maxTokens: 500,
    });
  }

  async loadMessages(sessionId: string): Promise<ConversationMessage[]> {
    const session = await this.db.chatSession.findUnique({
      where: { id: sessionId },
      select: { messages: true },
    });

    if (!session?.messages) {
      return [];
    }

    const parsed = JSON.parse(session.messages) as Array<{
      role: string;
      content: string;
      timestamp?: string;
    }>;

    return parsed.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    }));
  }

  async saveMessage(
    sessionId: string,
    message: ConversationMessage,
  ): Promise<void> {
    const messages = await this.loadMessages(sessionId);
    messages.push(message);

    await this.db.chatSession.update({
      where: { id: sessionId },
      data: {
        messages: JSON.stringify(
          messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          })),
        ),
        updatedAt: new Date(),
      },
    });
  }

  async compressIfNeeded(sessionId: string): Promise<CompressionResult> {
    const messages = await this.loadMessages(sessionId);
    const currentTokens = tokenCounter.estimateMessages(messages);

    if (currentTokens < this.strategy.compressionThreshold) {
      return {
        compressed: false,
        strategy: "none",
        originalTokens: currentTokens,
        compressedTokens: currentTokens,
      };
    }

    const compressed = await this.compress(messages);
    const compressedTokens = tokenCounter.estimateMessages(compressed);

    await this.db.chatSession.update({
      where: { id: sessionId },
      data: {
        messages: JSON.stringify(
          compressed.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          })),
        ),
      },
    });

    return {
      compressed: true,
      strategy: this.strategy.compressionStrategy,
      originalTokens: currentTokens,
      compressedTokens,
    };
  }

  private async compress(
    messages: ConversationMessage[],
  ): Promise<ConversationMessage[]> {
    if (messages.length <= 11 || messages.length === 0) {
      return messages;
    }

    const firstMessage = messages[0]!;
    const recentMessages = messages.slice(-10);
    const middleMessages = messages.slice(1, -10);

    if (this.strategy.compressionStrategy === "sliding_window") {
      return [firstMessage, ...recentMessages];
    }

    if (
      this.strategy.compressionStrategy === "summarization" ||
      this.strategy.compressionStrategy === "hybrid"
    ) {
      const summary = await this.summarizeMessages(middleMessages);
      const summaryMessage: ConversationMessage = {
        role: "system",
        content: `[Résumé de la conversation précédente]\n\n${summary}`,
        timestamp: new Date(),
      };

      return [firstMessage, summaryMessage, ...recentMessages];
    }

    return messages;
  }

  private async summarizeMessages(
    messages: ConversationMessage[],
  ): Promise<string> {
    if (messages.length === 0) {
      return "";
    }

    const conversationText = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const prompt = `Résume cette conversation en conservant les points clés, décisions importantes, et contexte business mentionné. Sois concis mais précis.

Conversation:
${conversationText}

Résumé:`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      return response.content as string;
    } catch (error) {
      console.error("[ConversationMemory] Failed to summarize:", error);
      return `[${messages.length} messages résumés]`;
    }
  }

  toBaseMessages(messages: ConversationMessage[]): BaseMessage[] {
    return messages.map((msg) => {
      switch (msg.role) {
        case "user":
          return new HumanMessage(msg.content);
        case "assistant":
          return new AIMessage(msg.content);
        case "system":
          return new SystemMessage(msg.content);
        default:
          return new HumanMessage(msg.content);
      }
    });
  }

  async getContextWindow(
    sessionId: string,
    systemPrompt: string,
  ): Promise<{
    messages: BaseMessage[];
    tokensUsed: number;
    compressionApplied: boolean;
  }> {
    const messages = await this.loadMessages(sessionId);
    const tokensUsed = tokenCounter.estimatePrompt(systemPrompt, messages);

    let compressionApplied = false;
    let finalMessages = messages;

    if (tokensUsed > this.strategy.compressionThreshold) {
      const result = await this.compressIfNeeded(sessionId);
      compressionApplied = result.compressed;
      finalMessages = await this.loadMessages(sessionId);
    }

    return {
      messages: this.toBaseMessages(finalMessages),
      tokensUsed: tokenCounter.estimateMessages(finalMessages),
      compressionApplied,
    };
  }
}
