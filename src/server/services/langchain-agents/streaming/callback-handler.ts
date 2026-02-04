import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { StreamCallback } from "../types";

export class StreamCallbackHandler extends BaseCallbackHandler {
  name = "stream_callback_handler";

  constructor(private emit: StreamCallback) {
    super();
  }

  async handleLLMNewToken(token: string): Promise<void> {
    this.emit({
      type: "token",
      data: { token },
      timestamp: Date.now(),
    });
  }

  async handleLLMStart(): Promise<void> {
    this.emit({
      type: "message",
      data: { phase: "start" },
      timestamp: Date.now(),
    });
  }

  async handleLLMEnd(): Promise<void> {
    this.emit({
      type: "message",
      data: { phase: "end" },
      timestamp: Date.now(),
    });
  }

  async handleToolError(error: Error): Promise<void> {
    this.emit({
      type: "error",
      data: {
        error: error.message,
        source: "tool",
      },
      timestamp: Date.now(),
    });
  }

  async handleChainError(error: Error): Promise<void> {
    this.emit({
      type: "error",
      data: {
        error: error.message,
        source: "chain",
      },
      timestamp: Date.now(),
    });
  }
}
