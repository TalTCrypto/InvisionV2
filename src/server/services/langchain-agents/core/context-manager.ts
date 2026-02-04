import type { BaseMessage } from "@langchain/core/messages";
import type { ConversationMessage } from "../types";
import { tokenCounter } from "../memory/token-counter";

export class ContextManager {
  constructor(
    private maxTokens: number,
    private compressionThreshold: number,
  ) {}

  async optimizeContext(
    messages: ConversationMessage[],
    systemPrompt: string,
  ): Promise<{
    messages: ConversationMessage[];
    tokensUsed: number;
    compressionApplied: boolean;
  }> {
    const totalTokens = tokenCounter.estimatePrompt(systemPrompt, messages);

    if (totalTokens <= this.compressionThreshold) {
      return {
        messages,
        tokensUsed: totalTokens,
        compressionApplied: false,
      };
    }

    const optimized = this.applySlidingWindow(messages);
    const optimizedTokens = tokenCounter.estimatePrompt(
      systemPrompt,
      optimized,
    );

    return {
      messages: optimized,
      tokensUsed: optimizedTokens,
      compressionApplied: true,
    };
  }

  private applySlidingWindow(
    messages: ConversationMessage[],
  ): ConversationMessage[] {
    if (messages.length <= 11) {
      return messages;
    }

    const firstMessage = messages[0];
    const recentMessages = messages.slice(-10);

    if (firstMessage) {
      return [firstMessage, ...recentMessages];
    }

    return recentMessages;
  }

  estimateTokens(messages: ConversationMessage[]): number {
    return tokenCounter.estimateMessages(messages);
  }

  canFitInContext(
    messages: ConversationMessage[],
    systemPrompt: string,
  ): boolean {
    const tokens = tokenCounter.estimatePrompt(systemPrompt, messages);
    return tokens <= this.maxTokens;
  }
}
