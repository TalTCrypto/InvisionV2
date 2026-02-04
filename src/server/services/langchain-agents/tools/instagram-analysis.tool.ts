import { z } from "zod";
import { BaseTool } from "./base-tool";
import type { ToolExecutionContext } from "../types";
import type {
  InstagramReelAnalyzer,
  ReelAnalysisResult,
} from "~/server/utils/instagram-analyzer";

interface InstagramAnalysisInput {
  reelUrl: string;
}

export class InstagramAnalysisTool extends BaseTool<
  InstagramAnalysisInput,
  ReelAnalysisResult
> {
  readonly name = "analyze_instagram_reel";
  readonly description =
    "Analyse complète d'un reel Instagram: hook (0-3s), rétention, potentiel viral, insights actionnables. Fournit des recommandations concrètes et quick wins.";
  readonly schema = z.object({
    reelUrl: z
      .string()
      .url()
      .describe("URL complète du reel Instagram à analyser"),
  });
  readonly tags = ["instagram", "analysis", "social-media", "content"];

  constructor(private analyzer: InstagramReelAnalyzer) {
    super();
  }

  async execute(
    _input: InstagramAnalysisInput,
    _context: ToolExecutionContext,
  ): Promise<ReelAnalysisResult> {
    throw new Error(
      "Instagram analysis tool not yet fully implemented. The analyzer needs integration with transcript fetching service.",
    );
  }
}
