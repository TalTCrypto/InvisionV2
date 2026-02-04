import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";
import type {
  AgentResponse,
  AgentExecutionContext,
  StreamCallback,
  LLMModel,
  ReasoningStep,
  ToolExecution,
} from "../types";
import type { BaseTool } from "../tools/base-tool";
import type { ConnectedIntegration } from "../tools/composio.tool-loader";
import { type ConversationMemory } from "../memory/conversation-memory";
import { env } from "~/env";

export class AgentExecutor {
  private llm: BaseChatModel;

  constructor(
    model: LLMModel,
    private tools: BaseTool[],
    private systemPrompt: string,
    private memory: ConversationMemory,
    private maxIterations = 10,
    temperature = 0.3,
    private connectedIntegrations: ConnectedIntegration[] = [],
  ) {
    this.llm = this.createLLM(model, temperature);
  }

  private createLLM(model: LLMModel, temperature: number): BaseChatModel {
    switch (model) {
      case "gpt-4o":
      case "gpt-4o-mini":
        return new ChatOpenAI({
          openAIApiKey: env.OPENAI_API_KEY,
          modelName: model,
          temperature,
          streaming: true,
        });
      case "claude-sonnet-4.5":
        return new ChatAnthropic({
          modelName: "claude-sonnet-4-20250514",
          temperature,
          streaming: true,
        });
    }
  }

  async execute(
    input: string,
    context: AgentExecutionContext,
    streamCallback?: StreamCallback,
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const reasoning: ReasoningStep[] = [];
    const toolsUsed: ToolExecution[] = [];

    for (const tool of this.tools) {
      tool.setContext(context);
    }

    const messages = await this.memory.loadMessages(context.sessionId);
    const conversationHistory = this.memory.toBaseMessages(messages);

    const integrationsCtx = this.buildIntegrationsContext();
    const systemParts = [this.systemPrompt, this.buildToolsDescription()];
    if (integrationsCtx) systemParts.push(integrationsCtx);
    const systemMessages: SystemMessage[] = [
      new SystemMessage(systemParts.join("\n\n")),
    ];

    const currentMessages = [
      ...systemMessages,
      ...conversationHistory.filter(
        (msg): msg is SystemMessage | HumanMessage | AIMessage =>
          msg instanceof SystemMessage ||
          msg instanceof HumanMessage ||
          msg instanceof AIMessage,
      ),
      new HumanMessage(input),
    ];

    try {
      // ReAct loop
      let finalAnswer = "";
      let iteration = 0;

      console.log(
        `[AgentExecutor] Tools available: ${this.tools.map((t) => t.name).join(", ")}`,
      );

      while (iteration < this.maxIterations && !finalAnswer) {
        iteration++;

        const result = await this.llm.invoke(currentMessages as never[], {
          stop: ["Observation:"],
        });
        const response = result.content as string;

        // Parse response for ReAct format
        const parsed = this.parseReActResponse(response);

        if (parsed.type === "final_answer") {
          finalAnswer = parsed.content;
          break;
        }

        if (
          parsed.type === "tool_call" &&
          parsed.action &&
          parsed.actionInput
        ) {
          // Record reasoning step
          reasoning.push({
            step: iteration,
            thought: parsed.thought ?? "",
            action: parsed.action,
            actionInput: parsed.actionInput,
            timestamp: Date.now(),
          });

          // Execute tool
          const toolExecution = await this.executeTool(
            parsed.action,
            parsed.actionInput,
            context,
          );

          toolsUsed.push(toolExecution);

          // Add observation to conversation
          currentMessages.push(new AIMessage(response));
          currentMessages.push(
            new HumanMessage(`Observation: ${String(toolExecution.output)}`),
          );

          // Update last reasoning step with observation
          if (reasoning.length > 0) {
            reasoning[reasoning.length - 1]!.observation = String(
              toolExecution.output,
            );
          }
        } else {
          // No tool call, treat as final answer
          finalAnswer = response;
        }
      }

      if (!finalAnswer) {
        finalAnswer =
          "J'ai atteint la limite d'itérations sans trouver de réponse complète. Pouvez-vous reformuler votre question?";
      }

      // Save to memory
      await this.memory.saveMessage(context.sessionId, {
        role: "user",
        content: input,
        timestamp: new Date(),
      });

      await this.memory.saveMessage(context.sessionId, {
        role: "assistant",
        content: finalAnswer,
        timestamp: new Date(),
      });

      const duration = Date.now() - startTime;

      return {
        output: finalAnswer,
        reasoning,
        toolsUsed,
        tokensUsed: 0,
        duration,
      };
    } catch (error) {
      console.error("[AgentExecutor] Execution failed:", error);
      throw error;
    }
  }

  private async executeWithStreaming(
    messages: Array<SystemMessage | HumanMessage | AIMessage>,
    streamCallback: StreamCallback,
  ): Promise<string> {
    let fullResponse = "";

    const stream = await this.llm.stream(messages as never[]);

    for await (const chunk of stream) {
      const content = chunk.content as string;
      if (content) {
        fullResponse += content;
        streamCallback({
          type: "token",
          data: { token: content, accumulated: fullResponse },
          timestamp: Date.now(),
        });
      }
    }

    return fullResponse;
  }

  async *stream(
    input: string,
    context: AgentExecutionContext,
  ): AsyncGenerator<{
    type: "token" | "message" | "tool" | "end";
    data: unknown;
  }> {
    for (const tool of this.tools) {
      tool.setContext(context);
    }

    // Load history before saving so the current input is not duplicated.
    const messages = await this.memory.loadMessages(context.sessionId);
    const conversationHistory = this.memory.toBaseMessages(messages);

    // Persist user message immediately so the frontend can drop its
    // optimistic copy as soon as the first DB refetch returns.
    await this.memory.saveMessage(context.sessionId, {
      role: "user",
      content: input,
      timestamp: new Date(),
    });

    const integrationsCtx = this.buildIntegrationsContext();
    const systemParts = [this.systemPrompt, this.buildToolsDescription()];
    if (integrationsCtx) systemParts.push(integrationsCtx);
    const systemMessages: SystemMessage[] = [
      new SystemMessage(systemParts.join("\n\n")),
    ];

    const currentMessages = [
      ...systemMessages,
      ...conversationHistory.filter(
        (msg): msg is SystemMessage | HumanMessage | AIMessage =>
          msg instanceof SystemMessage ||
          msg instanceof HumanMessage ||
          msg instanceof AIMessage,
      ),
      new HumanMessage(input),
    ];

    let finalAnswer = "";
    let iteration = 0;

    console.log(
      `[AgentExecutor] Tools available: ${this.tools.map((t) => t.name).join(", ")}`,
    );

    while (iteration < this.maxIterations && !finalAnswer) {
      iteration++;

      let iterationResponse = "";
      let streamingFinalAnswer = false;
      let finalAnswerAccum = "";
      const llmStream = await this.llm.stream(currentMessages as never[], {
        stop: ["Observation:"],
      });

      // Buffer tokens until "Final Answer:" is detected; only stream the
      // actual answer content — Thought / Action lines stay hidden.
      for await (const chunk of llmStream) {
        const content = chunk.content as string;
        if (content) {
          iterationResponse += content;

          if (
            !streamingFinalAnswer &&
            iterationResponse.includes("Final Answer:")
          ) {
            streamingFinalAnswer = true;
            const afterFA = iterationResponse
              .split("Final Answer:")
              .slice(1)
              .join("Final Answer:")
              .trimStart();
            if (afterFA) {
              finalAnswerAccum = afterFA;
              yield {
                type: "token",
                data: { token: afterFA, accumulated: afterFA },
              };
            }
          } else if (streamingFinalAnswer) {
            finalAnswerAccum += content;
            yield {
              type: "token",
              data: { token: content, accumulated: finalAnswerAccum },
            };
          }
          // Before "Final Answer:" (Thought / Action phases) — buffer only.
        }
      }

      // Parse + log reasoning for every iteration
      const parsed = this.parseReActResponse(iterationResponse);
      console.log(
        `[AgentExecutor] Iteration ${iteration} → ${parsed.type}${parsed.action ? ` [${parsed.action}]` : ""}\n${iterationResponse}\n---`,
      );

      if (parsed.type === "final_answer") {
        finalAnswer = parsed.content;
        // If "Final Answer:" marker was never seen (bare response or Thought-
        // only), replay the cleaned content character-by-character now.
        if (!streamingFinalAnswer) {
          for (const char of finalAnswer) {
            yield {
              type: "token",
              data: { token: char, accumulated: finalAnswer },
            };
            await new Promise((resolve) => setTimeout(resolve, 8));
          }
        }
        break;
      }

      if (parsed.type === "tool_call" && parsed.action && parsed.actionInput) {
        // Notify tool execution
        yield {
          type: "tool",
          data: {
            action: parsed.action,
            input: parsed.actionInput,
            thought: parsed.thought,
          },
        };

        // Execute tool
        const toolExecution = await this.executeTool(
          parsed.action,
          parsed.actionInput,
          context,
        );

        // Notify tool result
        yield {
          type: "tool",
          data: {
            action: parsed.action,
            output: toolExecution.output,
            success: toolExecution.success,
            duration: toolExecution.duration,
          },
        };

        // Update messages
        currentMessages.push(new AIMessage(iterationResponse));
        currentMessages.push(
          new HumanMessage(`Observation: ${String(toolExecution.output)}`),
        );
      } else {
        finalAnswer = iterationResponse;
      }
    }

    if (!finalAnswer) {
      finalAnswer =
        "J'ai atteint la limite d'itérations sans trouver de réponse complète. Pouvez-vous reformuler votre question?";
    }

    // Save assistant response to memory (user message was already saved at stream start)
    await this.memory.saveMessage(context.sessionId, {
      role: "assistant",
      content: finalAnswer,
      timestamp: new Date(),
    });

    yield {
      type: "message",
      data: { content: finalAnswer, complete: true },
    };

    yield {
      type: "end",
      data: {},
    };
  }

  private buildToolsDescription(): string {
    if (this.tools.length === 0) {
      return "Aucun outil disponible. Réponds directement à partir de tes connaissances.";
    }

    const toolsDesc = this.tools
      .map((tool) => {
        const shape = (tool.schema as { shape?: Record<string, unknown> })
          .shape;
        let paramsStr = "{}";
        if (shape) {
          const paramLines = Object.entries(shape).map(([key, zodField]) => {
            // Unwrap ZodOptional → ZodDefault → inner leaf type
            type ZodNode = {
              _def?: {
                typeName?: string;
                innerType?: ZodNode;
                schema?: ZodNode;
                description?: string;
              };
              description?: string;
            };
            let node = zodField as ZodNode;
            let isOptional = false;

            if (node?._def?.typeName === "ZodOptional") {
              isOptional = true;
              node = node._def.innerType ?? {};
            }
            if (node?._def?.typeName === "ZodDefault") {
              isOptional = true; // has default → not required
              node = node._def.schema ?? {};
            }

            let typeName = "string";
            const tn = node?._def?.typeName;
            if (tn === "ZodBoolean") typeName = "boolean";
            else if (tn === "ZodNumber") typeName = "number";
            else if (tn === "ZodArray") typeName = "array";
            else if (tn === "ZodString") typeName = "string";
            else if (tn === "ZodAny") typeName = "any";

            const desc = String(
              node?._def?.description ?? node?.description ?? "",
            );
            const opt = isOptional ? "?" : "";
            return `"${key}"${opt}: ${typeName}${desc ? ` (${desc})` : ""}`;
          });
          paramsStr = `{\n      ${paramLines.join(",\n      ")}\n    }`;
        }

        return `- ${tool.name}: ${tool.description}\n    Input: ${paramsStr}`;
      })
      .join("\n");

    return `Outils disponibles (tu peux les appeler avec le format ReAct):\n${toolsDesc}`;
  }

  /**
   * Builds the integrations-awareness block injected as a system message.
   * Tells the agent exactly which external accounts are connected and
   * instructs it to use them proactively instead of asking for links.
   */
  private buildIntegrationsContext(): string | null {
    if (this.connectedIntegrations.length === 0) return null;

    const names = this.connectedIntegrations.map(
      (i) => i.toolkitSlug.charAt(0).toUpperCase() + i.toolkitSlug.slice(1),
    );

    const composioTools = this.tools.filter((t) => t.tags.includes("composio"));

    const toolsList = composioTools
      .map((t) => `  - ${t.name}: ${t.description}`)
      .join("\n");

    const platformHints: string[] = [];

    const hasYoutube = this.connectedIntegrations.some(
      (i) => i.toolkitSlug === "youtube",
    );
    if (hasYoutube) {
      platformHints.push(
        `### YouTube — usage correct`,
        `- Pour accéder à TA chaîne: utilise \`mine: true\` (jamais \`channelId: "me"\`)`,
        `- Flux analyse complète: youtube_get_channel_statistics(mine:true) → youtube_list_channel_videos(mine:true) → youtube_get_video_details_batch(id:[videoIds]) → youtube_list_caption_track(video_id) → youtube_load_captions(id:trackId)`,
        `- Les transcrits nécessitent 2 appels: d'abord list_caption_track pour obtenir le trackId, puis load_captions avec ce trackId`,
        `- youtube_get_video_details_batch accepte un tableau d'IDs — batch les vidéos en un seul appel`,
      );
    }

    const hasInstagram = this.connectedIntegrations.some(
      (i) => i.toolkitSlug === "instagram",
    );
    if (hasInstagram) {
      platformHints.push(
        `### Instagram — usage correct`,
        `- Pour accéder à TON compte: utilise les outils sans paramètre userId explicite`,
        `- Récupère d'abord les métadonnées du compte, puis drill dans les posts/reels spécifiques`,
      );
    }

    return [
      `## Intégrations connectées de l'utilisateur`,
      ``,
      `L'utilisateur a les comptes suivants connectés: ${names.join(", ")}.`,
      ``,
      `IMPORTANT — règles strictes:`,
      `1. Ne JAMAIS demander un lien ou une URL à l'utilisateur si un outil Composio correspondant existe.`,
      `2. Utilise TOUJOURS les outils ci-dessous pour récupérer les données directement depuis les comptes connectés.`,
      `3. Si l'utilisateur mentionne "ma vidéo YouTube", "mon reel Instagram", etc., utilise l'outil approprié IMMÉDIATEMENT.`,
      `4. Les outils Composio sont la source de vérité — donne la priorité à leurs résultats.`,
      ``,
      ...(platformHints.length > 0
        ? [`## Patterns d'utilisation par plateforme`, ``, ...platformHints, ``]
        : []),
      `Outils Composio disponibles:`,
      toolsList,
    ].join("\n");
  }

  private parseReActResponse(response: string): {
    type: "tool_call" | "final_answer";
    thought?: string;
    action?: string;
    actionInput?: unknown;
    content: string;
  } {
    // Check for Final Answer
    if (response.includes("Final Answer:")) {
      const finalAnswerMatch = /Final Answer:\s*(.+)/is.exec(response);
      return {
        type: "final_answer",
        content: finalAnswerMatch?.[1]?.trim() ?? response,
      };
    }

    // Parse ReAct format
    const thoughtMatch = /Thought:\s*(.+?)(?=\nAction:|$)/is.exec(response);
    const actionMatch = /Action:\s*(\w+)/i.exec(response);
    const actionInputRaw = (/Action Input:\s*([\s\S]+)/i.exec(response) ??
      /^Input:\s*([\s\S]+)/im.exec(response))?.[1]?.trim();

    if (actionMatch && actionInputRaw) {
      let actionInput: unknown;
      try {
        actionInput = this.extractJSON(actionInputRaw);
      } catch {
        console.warn(
          "[AgentExecutor] Failed to parse action input:",
          actionInputRaw,
        );
        actionInput = {};
      }

      return {
        type: "tool_call",
        thought: thoughtMatch?.[1]?.trim(),
        action: actionMatch[1]!.trim(),
        actionInput,
        content: response,
      };
    }

    // No valid ReAct format — treat as final answer.
    // Strip a stray "Thought:" prefix if the model forgot "Final Answer:".
    const thoughtOnly = /^Thought:\s*([\s\S]+)/i.exec(response);
    return {
      type: "final_answer",
      content: thoughtOnly ? thoughtOnly[1]!.trim() : response,
    };
  }

  /**
   * Extracts the first balanced JSON object or array from a string.
   * Correctly handles nested braces/brackets unlike a simple regex.
   */
  private extractJSON(str: string): unknown {
    const open = str[0];
    if (open !== "{" && open !== "[") return JSON.parse(str);
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "{" || str[i] === "[") depth++;
      else if (str[i] === "}" || str[i] === "]") depth--;
      if (depth === 0) return JSON.parse(str.slice(0, i + 1));
    }
    return JSON.parse(str);
  }

  private async executeTool(
    toolName: string,
    input: unknown,
    context: AgentExecutionContext,
  ): Promise<ToolExecution> {
    const startTime = Date.now();

    try {
      const tool = this.tools.find((t) => t.name === toolName);

      if (!tool) {
        return {
          toolName,
          input,
          output: `Erreur: Outil "${toolName}" non trouvé. Outils disponibles: ${this.tools.map((t) => t.name).join(", ")}`,
          duration: Date.now() - startTime,
          success: false,
          error: "Tool not found",
        };
      }

      tool.setContext(context);
      const langchainTool = tool.toLangChainTool();
      const result = (await langchainTool.invoke(input)) as string;

      return {
        toolName,
        input,
        output: result,
        duration: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        toolName,
        input,
        output: `Erreur lors de l'exécution de l'outil: ${errorMessage}`,
        duration: Date.now() - startTime,
        success: false,
        error: errorMessage,
      };
    }
  }
}
