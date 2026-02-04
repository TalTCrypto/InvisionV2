export type CompressionStrategy = "sliding_window" | "summarization" | "hybrid";

export interface MemoryStrategy {
  maxTokens: number;
  compressionThreshold: number;
  compressionStrategy: CompressionStrategy;
}

export interface BusinessContext {
  companyName?: string;
  industry?: string;
  goals: string[];
  kpis: Record<string, string>;
  preferences: Record<string, unknown>;
  extractedAt: Date;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface CompressionResult {
  compressed: boolean;
  strategy: CompressionStrategy | "none";
  originalTokens: number;
  compressedTokens: number;
}
