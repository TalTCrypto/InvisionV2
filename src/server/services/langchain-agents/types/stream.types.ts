export type StreamEventType =
  | "token"
  | "tool"
  | "reasoning"
  | "message"
  | "error"
  | "end";

export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
  timestamp: number;
}

export type StreamCallback = (event: StreamEvent) => void;

export interface ToolStreamData {
  tool: string;
  input: unknown;
  output?: unknown;
  phase: "start" | "end";
  duration?: number;
}

export interface ReasoningStreamData {
  thought: string;
  action?: string;
  actionInput?: unknown;
}

export interface TokenStreamData {
  token: string;
  accumulated?: string;
}

export interface ErrorStreamData {
  error: string;
  code?: string;
}
