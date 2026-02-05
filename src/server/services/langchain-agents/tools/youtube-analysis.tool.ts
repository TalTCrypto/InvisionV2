import { z } from "zod";
import { BaseTool } from "./base-tool";
import type { ToolExecutionContext } from "../types";
import type {
  YouTubeAnalyzer,
  AnalysisResult,
} from "~/server/utils/youtube-analyzer";
import { getYouTubeTranscript } from "~/server/utils/youtube-transcript";
import { getYouTubeTranscriptViaWhisper } from "~/server/utils/youtube-whisper-transcript";
import { parseTranscript } from "~/server/utils/transcript-parser";
import { transcribeAudio } from "~/server/utils/audio-transcriber";

interface YouTubeAnalysisInput {
  videoUrl?: string;
  transcript?: string;
  audioBase64?: string;
  title?: string;
  channel?: string;
  durationSeconds?: number;
}

export class YouTubeAnalysisTool extends BaseTool<
  YouTubeAnalysisInput,
  AnalysisResult
> {
  readonly name = "analyze_youtube_video";
  readonly description =
    "Analyse YouTube Pro — analyse chirurgicale pour créateurs et infopreneurs. " +
    "Analyse détaillée d'une vidéo: hook, structure, rétention, opportunités de croissance, insights SEO. " +
    "Trois modes d'entrée: " +
    "(1) URL YouTube — transcript récupéré automatiquement; " +
    "(2) Transcript brut — SRT, VTT, texte avec timestamps [MM:SS], ou texte brut; " +
    "(3) Fichier audio en base64 — transcrit via Whisper puis analysé. " +
    "Titre, chaîne et durée peuvent être précisés pour enrichir l'analyse.";
  readonly schema = z
    .object({
      videoUrl: z
        .string()
        .url()
        .optional()
        .describe("URL de la vidéo YouTube à analyser"),
      transcript: z
        .string()
        .optional()
        .describe(
          "Transcript brut (SRT, VTT, timestamps [MM:SS], ou texte brut)",
        ),
      audioBase64: z
        .string()
        .optional()
        .describe(
          "Fichier audio encodé en base64 — transcrit via Whisper puis analysé. " +
            "Formats: mp3, m4a, wav, webm, flac, ogg, opus. Max 25 MB.",
        ),
      title: z.string().optional().describe("Titre de la vidéo"),
      channel: z.string().optional().describe("Nom de la chaîne YouTube"),
      durationSeconds: z
        .number()
        .optional()
        .describe("Durée en secondes (estimée automatiquement si absente)"),
    })
    .refine(
      (data) => !!(data.videoUrl ?? data.transcript ?? data.audioBase64),
      { message: "Fournissez videoUrl, transcript, ou audioBase64" },
    );
  readonly tags = ["youtube", "analysis", "social-media", "content", "seo"];

  constructor(private analyzer: YouTubeAnalyzer) {
    super();
  }

  async execute(
    input: YouTubeAnalysisInput,
    _context: ToolExecutionContext,
  ): Promise<AnalysisResult> {
    const { audioBase64, transcript, videoUrl } = input;
    if (audioBase64) {
      return this.analyzeFromAudio(audioBase64, input);
    }
    if (transcript) {
      return this.analyzeFromTranscript(transcript, input);
    }
    if (videoUrl) {
      return this.analyzeFromUrl(videoUrl, input);
    }
    throw new Error("Fournissez videoUrl, transcript, ou audioBase64");
  }

  /** base64 audio → Whisper → analyze */
  private async analyzeFromAudio(
    audioBase64: string,
    input: YouTubeAnalysisInput,
  ): Promise<AnalysisResult> {
    const buffer = Buffer.from(audioBase64, "base64");
    const transcribed = await transcribeAudio(buffer);

    return this.analyzer.analyze({
      title: input.title ?? "Vidéo sans titre",
      channel: input.channel ?? "Chaîne inconnue",
      transcript: transcribed.fullText,
      wordCount: transcribed.fullText.split(/\s+/).filter(Boolean).length,
      language: transcribed.language,
      segments: transcribed.segments,
      videoDurationSeconds:
        input.durationSeconds ?? transcribed.durationSeconds,
    });
  }

  /** Raw transcript → parse → analyze */
  private analyzeFromTranscript(
    transcript: string,
    input: YouTubeAnalysisInput,
  ): Promise<AnalysisResult> {
    const parsed = parseTranscript(transcript);
    const wordCount = parsed.fullText.split(/\s+/).filter(Boolean).length;

    return this.analyzer.analyze({
      title: input.title ?? "Vidéo sans titre",
      channel: input.channel ?? "Chaîne inconnue",
      transcript: parsed.fullText,
      wordCount,
      language: "fr",
      segments: parsed.segments,
      videoDurationSeconds:
        input.durationSeconds ?? parsed.estimatedDurationSeconds,
    });
  }

  /** URL → fetch transcript (captions, Whisper fallback) → analyze */
  private async analyzeFromUrl(
    videoUrl: string,
    input: YouTubeAnalysisInput,
  ): Promise<AnalysisResult> {
    const result = await getYouTubeTranscript(videoUrl).catch(() =>
      getYouTubeTranscriptViaWhisper(videoUrl),
    );

    const lastSegment = result.transcript[result.transcript.length - 1];
    const durationFromSegments = lastSegment
      ? lastSegment.start + lastSegment.duration
      : 0;
    const wordCount = result.fullText.split(/\s+/).filter(Boolean).length;

    return this.analyzer.analyze({
      title: result.metadata.title ?? input.title ?? "Vidéo YouTube",
      channel:
        result.metadata.channelTitle ?? input.channel ?? "Chaîne inconnue",
      transcript: result.fullText,
      wordCount,
      language: result.language ?? "fr",
      segments: result.transcript,
      videoDurationSeconds: input.durationSeconds ?? durationFromSegments,
    });
  }
}
