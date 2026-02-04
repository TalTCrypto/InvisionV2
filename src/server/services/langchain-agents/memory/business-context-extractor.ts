import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { SystemMessage } from "@langchain/core/messages";
import type { BusinessContext, ConversationMessage } from "../types";
import { env } from "~/env";

const businessContextSchema = z.object({
  companyName: z.string().optional().describe("Nom de l'entreprise mentionné"),
  industry: z.string().optional().describe("Secteur d'activité"),
  goals: z
    .array(z.string())
    .describe("Objectifs business mentionnés dans la conversation"),
  kpis: z
    .record(z.string())
    .describe("KPIs ou métriques mentionnées avec leurs valeurs"),
  preferences: z
    .record(z.unknown())
    .describe("Préférences utilisateur (ton, style, formats, etc.)"),
});

export class BusinessContextExtractor {
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: "gpt-4o-mini",
      temperature: 0.1,
      maxTokens: 1000,
    });
  }

  async extract(messages: ConversationMessage[]): Promise<BusinessContext> {
    if (messages.length === 0) {
      return this.getEmptyContext();
    }

    const conversationText = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const extractionPrompt = `Analyse cette conversation et extrais le contexte business structuré.

Instructions:
- Extrais uniquement les informations explicitement mentionnées
- Pour les KPIs, note la valeur ou l'objectif mentionné
- Pour les préférences, note les choix de style, ton, formats préférés
- Si une information n'est pas mentionnée, ne l'invente pas

Conversation:
${conversationText}

Réponds en JSON structuré selon le schéma fourni.`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage(
          "Tu es un assistant qui extrait du contexte business de conversations. Réponds uniquement en JSON valide.",
        ),
        new SystemMessage(extractionPrompt),
      ]);

      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        console.warn(
          "[BusinessContextExtractor] No JSON found in response:",
          content,
        );
        return this.getEmptyContext();
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      const validated = businessContextSchema.parse(parsed);

      return {
        ...validated,
        extractedAt: new Date(),
      };
    } catch (error) {
      console.error("[BusinessContextExtractor] Failed to extract:", error);
      return this.getEmptyContext();
    }
  }

  private getEmptyContext(): BusinessContext {
    return {
      goals: [],
      kpis: {},
      preferences: {},
      extractedAt: new Date(),
    };
  }
}
