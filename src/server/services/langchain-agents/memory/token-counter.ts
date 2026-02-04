import type { ConversationMessage } from "../types";

export class TokenCounter {
  private static readonly CHARS_PER_TOKEN = 4;

  estimateMessages(messages: ConversationMessage[]): number {
    let totalTokens = 0;

    for (const message of messages) {
      totalTokens += this.estimateText(message.content);
      totalTokens += 4;
    }

    return totalTokens;
  }

  estimateText(text: string): number {
    return Math.ceil(text.length / TokenCounter.CHARS_PER_TOKEN);
  }

  estimatePrompt(systemPrompt: string, messages: ConversationMessage[]): number {
    return (
      this.estimateText(systemPrompt) +
      this.estimateMessages(messages) +
      100
    );
  }
}

export const tokenCounter = new TokenCounter();
