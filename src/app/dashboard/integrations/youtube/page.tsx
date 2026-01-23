"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Youtube,
  Search,
  Loader2,
  FileText,
  Lightbulb,
  Target,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Eye,
  User,
  Calendar,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Zap,
  Clock,
  BarChart3,
  AlertTriangle,
  Star,
  Rocket,
  Tag,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Play,
  PauseCircle,
  RefreshCw,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { AnimatedCard } from "~/components/ui/animated-card";
import { BlurFade } from "~/components/ui/blur-fade";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

interface HookAnalysis {
  score: number;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  suggestion: string;
  firstWords: string;
  exactQuotes?: string[];
}

interface SegmentAnalysis {
  timestamp: string;
  duration: string;
  topic: string;
  engagementScore: number;
  retentionImpact: string;
  strengths: string[];
  improvements: string[];
  keyQuote?: string;
}

interface StructureAnalysis {
  intro: {
    duration: string;
    score: number;
    hasHook: boolean;
    hasPromise: boolean;
    feedback: string;
    quote?: string;
  };
  body: {
    segments: SegmentAnalysis[];
    pacing: string;
    transitions: number;
  };
  conclusion: {
    duration: string;
    score: number;
    hasCta: boolean;
    ctaType: string;
    ctaStrength: number;
    feedback: string;
    quote?: string;
  };
}

interface RetentionAnalysis {
  overallScore: number;
  predictedAvgViewDuration: string;
  dropPoints: Array<{
    timestamp: string;
    reason: string;
    severity: string;
    quote?: string;
  }>;
  peakMoments: Array<{
    timestamp: string;
    reason: string;
    replicable: boolean;
    quote?: string;
  }>;
  benchmarkVsNiche: string;
}

interface GrowthOpportunities {
  titleAnalysis: {
    current: string;
    score: number;
    issues: string[];
    suggestions: string[];
  };
  thumbnailIdeas: string[];
  seoKeywords: string[];
  contentGaps: string[];
  viralPotential: {
    score: number;
    factors: string[];
    missing: string[];
  };
  monetizationAngles: string[];
}

interface ActionableInsight {
  priority: string;
  category: string;
  action: string;
  expectedImpact: string;
  effort: string;
}

interface AnalysisResult {
  overallScore?: number;
  verdict?: string;
  summary?: string;
  hookAnalysis?: HookAnalysis;
  structure?: StructureAnalysis;
  retention?: RetentionAnalysis;
  growth?: GrowthOpportunities;
  insights?: ActionableInsight[];
  quickWins?: string[];
  keyPoints?: string[];
  topics?: string[];
  targetAudience?: string;
  recommendations?: string[];
  videoDuration?: string;
}

interface VideoMetadata {
  videoId: string;
  title?: string;
  description?: string;
  channelTitle?: string;
  publishedAt?: string;
  viewCount?: string;
  duration?: string;
  durationSeconds?: number;
}

interface CachedAnalysis {
  metadata: VideoMetadata;
  transcript: string;
  analysis: AnalysisResult;
  cachedAt: number;
}

type AnalysisStep = "idle" | "fetching" | "analyzing" | "complete" | "error";

const CACHE_KEY_PREFIX = "yt-analysis-";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures

function getCachedAnalysis(videoId: string): CachedAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY_PREFIX + videoId);
    if (!cached) return null;
    const data = JSON.parse(cached) as CachedAnalysis;
    if (Date.now() - data.cachedAt > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY_PREFIX + videoId);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedAnalysis(
  videoId: string,
  metadata: VideoMetadata,
  transcript: string,
  analysis: AnalysisResult,
): void {
  if (typeof window === "undefined") return;
  try {
    const data: CachedAnalysis = {
      metadata,
      transcript,
      analysis,
      cachedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY_PREFIX + videoId, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

function extractVideoIdFromUrl(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match?.[1]) return match[1];
  }
  return null;
}

function ScoreRing({
  score,
  size = "lg",
}: {
  score: number;
  size?: "sm" | "lg";
}) {
  const getColor = (s: number) => {
    if (s >= 80) return "text-emerald-500";
    if (s >= 60) return "text-amber-500";
    if (s >= 40) return "text-orange-500";
    return "text-rose-500";
  };

  const getBgColor = (s: number) => {
    if (s >= 80) return "bg-emerald-500/10";
    if (s >= 60) return "bg-amber-500/10";
    if (s >= 40) return "bg-orange-500/10";
    return "bg-rose-500/10";
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-bold",
        getBgColor(score),
        getColor(score),
        size === "lg" ? "size-20 text-2xl" : "size-12 text-lg",
      )}
    >
      {score}
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const getColor = (s: number) => {
    if (s >= 80) return "bg-emerald-500";
    if (s >= 60) return "bg-amber-500";
    if (s >= 40) return "bg-orange-500";
    return "bg-rose-500";
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}/100</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-all", getColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export default function YouTubeAnalysisPage() {
  const [videoUrl, setVideoUrl] = useState("");
  const [step, setStep] = useState<AnalysisStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentStatus, setCurrentStatus] = useState("");
  const [isCached, setIsCached] = useState(false);

  const getTranscript = api.youtube.getTranscript.useQuery(
    { urlOrId: videoUrl, withTimestamps: true },
    { enabled: false },
  );

  // Charger depuis le cache quand l'URL change
  useEffect(() => {
    const videoId = extractVideoIdFromUrl(videoUrl);
    if (!videoId) {
      setIsCached(false);
      return;
    }

    const cached = getCachedAnalysis(videoId);
    if (cached) {
      setMetadata(cached.metadata);
      setTranscript(cached.transcript);
      setAnalysis(cached.analysis);
      setStep("complete");
      setIsCached(true);
    } else {
      setIsCached(false);
    }
  }, [videoUrl]);

  const startAnalysis = useCallback(
    async (forceRefresh = false) => {
      if (!videoUrl.trim()) return;

      const videoId = extractVideoIdFromUrl(videoUrl);

      // Vérifier le cache sauf si on force le refresh
      if (!forceRefresh && videoId) {
        const cached = getCachedAnalysis(videoId);
        if (cached) {
          setMetadata(cached.metadata);
          setTranscript(cached.transcript);
          setAnalysis(cached.analysis);
          setStep("complete");
          setIsCached(true);
          return;
        }
      }

      setStep("fetching");
      setError(null);
      setMetadata(null);
      setTranscript(null);
      setAnalysis(null);
      setStreamingText("");
      setCurrentStatus("Récupération du transcript...");
      setIsCached(false);

      try {
        const transcriptResult = await getTranscript.refetch();

        if (transcriptResult.error) {
          throw new Error(transcriptResult.error.message);
        }

        if (!transcriptResult.data) {
          throw new Error("Impossible de récupérer le transcript");
        }

        setMetadata(transcriptResult.data.metadata);
        setTranscript(transcriptResult.data.transcript);
        setStep("analyzing");

        const eventSource = new EventSource(
          `/api/youtube/analyze?videoId=${encodeURIComponent(videoUrl)}&language=fr`,
        );

        eventSource.addEventListener(
          "metadata",
          (event: MessageEvent<string>) => {
            const data = JSON.parse(event.data) as VideoMetadata;
            setMetadata((prev) => ({ ...prev, ...data }));
          },
        );

        eventSource.addEventListener(
          "status",
          (event: MessageEvent<string>) => {
            const data = JSON.parse(event.data) as {
              status: string;
              message: string;
            };
            setCurrentStatus(data.message);
          },
        );

        eventSource.addEventListener("token", (event: MessageEvent<string>) => {
          const data = JSON.parse(event.data) as { chunk?: string };
          if (data.chunk) {
            setStreamingText((prev) => prev + data.chunk);
          }
        });

        eventSource.addEventListener(
          "analysis",
          (event: MessageEvent<string>) => {
            const data = JSON.parse(event.data) as {
              complete: boolean;
              parsedAnalysis?: AnalysisResult;
            };

            if (data.complete && data.parsedAnalysis) {
              setAnalysis(data.parsedAnalysis);
              setStep("complete");
              eventSource.close();

              // Sauvegarder dans le cache
              if (videoId && transcriptResult.data) {
                setCachedAnalysis(
                  videoId,
                  transcriptResult.data.metadata,
                  transcriptResult.data.transcript,
                  data.parsedAnalysis,
                );
              }
            }
          },
        );

        eventSource.addEventListener("error", (event: MessageEvent<string>) => {
          const data = JSON.parse(event.data ?? "{}") as { error?: string };
          setError(data.error ?? "Erreur lors de l'analyse");
          setStep("error");
          eventSource.close();
        });

        eventSource.onerror = () => {
          if (step === "analyzing") {
            setStep("complete");
          }
          eventSource.close();
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        setStep("error");
      }
    },
    [videoUrl, getTranscript, step],
  );

  const formatNumber = (num: string | undefined) => {
    if (!num) return "N/A";
    const n = parseInt(num, 10);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <BlurFade delay={0}>
        <div className="mb-8">
          <Link
            href="/dashboard/integrations"
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" />
            Retour aux intégrations
          </Link>

          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 ring-1 ring-red-500/20">
              <Youtube className="size-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Analyse YouTube Pro
              </h1>
              <p className="text-muted-foreground mt-1">
                Analyse chirurgicale pour créateurs et infopreneurs
              </p>
            </div>
          </div>
        </div>
      </BlurFade>

      <BlurFade delay={0.1}>
        <AnimatedCard
          className="mb-8"
          gradientFrom="#ef4444"
          gradientTo="#f97316"
        >
          <div className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Search className="text-muted-foreground size-5" />
              <h2 className="text-lg font-semibold">Analyser une vidéo</h2>
            </div>
            <p className="text-muted-foreground mb-4 text-sm">
              Obtenez une analyse détaillée: hook, structure, rétention,
              opportunités de croissance
            </p>
            <div className="flex gap-3">
              <Input
                placeholder="https://youtube.com/watch?v=... ou ID de la vidéo"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="flex-1"
                disabled={step === "fetching" || step === "analyzing"}
              />
              <Button
                onClick={() => startAnalysis(false)}
                disabled={
                  !videoUrl.trim() ||
                  step === "fetching" ||
                  step === "analyzing"
                }
                className="gap-2"
              >
                {step === "fetching" || step === "analyzing" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Analyse...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Analyser
                  </>
                )}
              </Button>
            </div>
            {currentStatus && step === "analyzing" && (
              <div className="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                {currentStatus}
              </div>
            )}
          </div>
        </AnimatedCard>
      </BlurFade>

      {error && (
        <BlurFade delay={0.15}>
          <Card className="border-destructive/50 bg-destructive/5 mb-8">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="text-destructive size-5" />
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {metadata && (
        <BlurFade delay={0.2}>
          <AnimatedCard
            className="group mb-8"
            gradientFrom="#8b5cf6"
            gradientTo="#ec4899"
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold">
                    {metadata.title ?? "Vidéo YouTube"}
                  </h2>
                  <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-sm">
                    {metadata.channelTitle && (
                      <span className="flex items-center gap-1.5">
                        <User className="size-4" />
                        {metadata.channelTitle}
                      </span>
                    )}
                    {metadata.duration && (
                      <span className="text-foreground flex items-center gap-1.5 font-medium">
                        <Clock className="size-4" />
                        {metadata.duration}
                      </span>
                    )}
                    {metadata.viewCount && (
                      <span className="flex items-center gap-1.5">
                        <Eye className="size-4" />
                        {formatNumber(metadata.viewCount)} vues
                      </span>
                    )}
                    {metadata.publishedAt && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-4" />
                        {new Date(metadata.publishedAt).toLocaleDateString(
                          "fr-FR",
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isCached && step === "complete" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startAnalysis(true)}
                      className="gap-2 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <RefreshCw className="size-4" />
                      Réanalyser
                    </Button>
                  )}
                  {step === "complete" &&
                    analysis?.overallScore !== undefined && (
                      <ScoreRing score={analysis.overallScore} />
                    )}
                </div>
              </div>
            </div>
          </AnimatedCard>
        </BlurFade>
      )}

      {transcript && (
        <BlurFade delay={0.25}>
          <Card className="mb-8">
            <CardHeader
              className="cursor-pointer"
              onClick={() => setShowTranscript(!showTranscript)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-5" />
                  Transcript
                </CardTitle>
                <Button variant="ghost" size="sm">
                  {showTranscript ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            {showTranscript && (
              <CardContent>
                <div className="bg-muted/50 max-h-96 overflow-y-auto rounded-lg p-4">
                  <pre className="font-mono text-sm whitespace-pre-wrap">
                    {transcript}
                  </pre>
                </div>
              </CardContent>
            )}
          </Card>
        </BlurFade>
      )}

      {(step === "analyzing" || step === "complete") && analysis && (
        <div className="space-y-6">
          {analysis.verdict && (
            <BlurFade delay={0.3}>
              <AnimatedCard
                className="border-primary/20"
                gradientFrom="#8b5cf6"
                gradientTo="#06b6d4"
              >
                <div className="p-6">
                  <div className="flex items-center gap-4">
                    <ScoreRing score={analysis.overallScore ?? 0} />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">
                        {analysis.verdict}
                      </h3>
                      {analysis.summary && (
                        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                          {analysis.summary}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </AnimatedCard>
            </BlurFade>
          )}

          {analysis.quickWins && analysis.quickWins.length > 0 && (
            <BlurFade delay={0.35}>
              <AnimatedCard
                className="border-emerald-500/20"
                gradientFrom="#10b981"
                gradientTo="#22d3ee"
              >
                <div className="p-6">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                    <Zap className="size-5" />
                    Quick Wins - Actions Immédiates
                  </h3>
                  <ul className="space-y-2">
                    {analysis.quickWins.map((win, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        <span>{win}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </AnimatedCard>
            </BlurFade>
          )}

          {analysis.hookAnalysis && (
            <BlurFade delay={0.4}>
              <AnimatedCard gradientFrom="#f59e0b" gradientTo="#ef4444">
                <div className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-lg font-semibold">
                      <Play className="size-5" />
                      Analyse du Hook (30 premières secondes)
                    </h3>
                    <div
                      className={cn(
                        "rounded-full px-3 py-1 text-sm font-medium",
                        analysis.hookAnalysis.verdict === "excellent" &&
                          "bg-emerald-500/20 text-emerald-600",
                        analysis.hookAnalysis.verdict === "bon" &&
                          "bg-blue-500/20 text-blue-600",
                        analysis.hookAnalysis.verdict === "moyen" &&
                          "bg-amber-500/20 text-amber-600",
                        analysis.hookAnalysis.verdict === "faible" &&
                          "bg-rose-500/20 text-rose-600",
                      )}
                    >
                      {analysis.hookAnalysis.verdict?.toUpperCase()}
                    </div>
                  </div>

                  <ScoreBar
                    score={analysis.hookAnalysis.score}
                    label="Force du Hook"
                  />

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {analysis.hookAnalysis.strengths.length > 0 && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <h4 className="mb-2 flex items-center gap-2 font-medium text-emerald-600">
                          <ThumbsUp className="size-4" />
                          Points Forts
                        </h4>
                        <ul className="space-y-1 text-sm">
                          {analysis.hookAnalysis.strengths.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.hookAnalysis.weaknesses.length > 0 && (
                      <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
                        <h4 className="mb-2 flex items-center gap-2 font-medium text-rose-600">
                          <ThumbsDown className="size-4" />
                          Faiblesses
                        </h4>
                        <ul className="space-y-1 text-sm">
                          {analysis.hookAnalysis.weaknesses.map((w, i) => (
                            <li key={i}>• {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {analysis.hookAnalysis.exactQuotes &&
                    analysis.hookAnalysis.exactQuotes.length > 0 && (
                      <div className="mt-4 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
                        <h4 className="mb-2 flex items-center gap-2 font-medium text-violet-600">
                          <MessageSquare className="size-4" />
                          Citations Exactes du Hook
                        </h4>
                        <ul className="space-y-2">
                          {analysis.hookAnalysis.exactQuotes.map((quote, i) => (
                            <li
                              key={i}
                              className="border-l-2 border-violet-500/50 pl-3 text-sm italic"
                            >
                              &quot;{quote}&quot;
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {analysis.hookAnalysis.suggestion && (
                    <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                      <h4 className="mb-2 flex items-center gap-2 font-medium text-blue-600">
                        <Lightbulb className="size-4" />
                        Hook Alternatif Suggéré
                      </h4>
                      <p className="text-sm italic">
                        &quot;{analysis.hookAnalysis.suggestion}&quot;
                      </p>
                    </div>
                  )}
                </div>
              </AnimatedCard>
            </BlurFade>
          )}

          {analysis.structure && (
            <BlurFade delay={0.45}>
              <AnimatedCard gradientFrom="#3b82f6" gradientTo="#8b5cf6">
                <div className="p-6">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                    <BarChart3 className="size-5" />
                    Structure Narrative
                  </h3>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="bg-card/50 rounded-lg border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="font-medium">Introduction</h4>
                        <span className="text-muted-foreground text-sm">
                          {analysis.structure.intro.duration}
                        </span>
                      </div>
                      <ScoreBar
                        score={analysis.structure.intro.score}
                        label="Score"
                      />
                      <div className="mt-3 flex gap-2">
                        {analysis.structure.intro.hasHook && (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-600">
                            Hook ✓
                          </span>
                        )}
                        {analysis.structure.intro.hasPromise && (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-600">
                            Promesse ✓
                          </span>
                        )}
                      </div>
                      {analysis.structure.intro.feedback && (
                        <p className="text-muted-foreground mt-2 text-sm">
                          {analysis.structure.intro.feedback}
                        </p>
                      )}
                      {analysis.structure.intro.quote && (
                        <p className="text-muted-foreground border-primary/50 mt-2 border-l-2 pl-2 text-sm italic">
                          &quot;{analysis.structure.intro.quote}&quot;
                        </p>
                      )}
                    </div>

                    <div className="bg-card/50 rounded-lg border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="font-medium">Corps</h4>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            analysis.structure.body.pacing === "optimal" &&
                              "bg-emerald-500/20 text-emerald-600",
                            analysis.structure.body.pacing === "trop_lent" &&
                              "bg-amber-500/20 text-amber-600",
                            analysis.structure.body.pacing === "trop_rapide" &&
                              "bg-orange-500/20 text-orange-600",
                          )}
                        >
                          {analysis.structure.body.pacing?.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {analysis.structure.body.segments?.length ?? 0} segments
                        identifiés
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {analysis.structure.body.transitions} transitions
                      </p>
                    </div>

                    <div className="bg-card/50 rounded-lg border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="font-medium">Conclusion</h4>
                        <span className="text-muted-foreground text-sm">
                          {analysis.structure.conclusion.duration}
                        </span>
                      </div>
                      <ScoreBar
                        score={analysis.structure.conclusion.score}
                        label="Score"
                      />
                      {analysis.structure.conclusion.hasCta && (
                        <div className="mt-2">
                          <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-600">
                            CTA: {analysis.structure.conclusion.ctaType}
                          </span>
                          <div className="bg-muted mt-2 h-1 overflow-hidden rounded-full">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{
                                width: `${analysis.structure.conclusion.ctaStrength}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {analysis.structure.body.segments &&
                    analysis.structure.body.segments.length > 0 && (
                      <div className="mt-6">
                        <h4 className="mb-3 font-medium">Segments détaillés</h4>
                        <div className="space-y-3">
                          {analysis.structure.body.segments.map(
                            (segment, i) => (
                              <div
                                key={i}
                                className={cn(
                                  "bg-card/50 rounded-lg border p-4",
                                  segment.retentionImpact === "boost" &&
                                    "border-emerald-500/30",
                                  segment.retentionImpact === "drop" &&
                                    "border-rose-500/30",
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Clock className="text-muted-foreground size-4" />
                                    <span className="font-mono text-sm">
                                      {segment.timestamp}
                                    </span>
                                    <span className="font-medium">
                                      {segment.topic}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <ScoreRing
                                      score={segment.engagementScore}
                                      size="sm"
                                    />
                                    {segment.retentionImpact === "boost" && (
                                      <TrendingUp className="size-5 text-emerald-500" />
                                    )}
                                    {segment.retentionImpact === "drop" && (
                                      <TrendingDown className="size-5 text-rose-500" />
                                    )}
                                    {segment.retentionImpact === "stable" && (
                                      <PauseCircle className="text-muted-foreground size-5" />
                                    )}
                                  </div>
                                </div>
                                {segment.keyQuote && (
                                  <p className="text-muted-foreground border-primary/50 mt-2 border-l-2 pl-2 text-sm italic">
                                    &quot;{segment.keyQuote}&quot;
                                  </p>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </AnimatedCard>
            </BlurFade>
          )}

          {analysis.retention && (
            <BlurFade delay={0.5}>
              <AnimatedCard gradientFrom="#06b6d4" gradientTo="#3b82f6">
                <div className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-lg font-semibold">
                      <TrendingUp className="size-5" />
                      Analyse de Rétention
                    </h3>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {analysis.retention.overallScore}%
                      </div>
                      <div className="text-muted-foreground text-sm">
                        Score de rétention
                      </div>
                    </div>
                  </div>

                  <div className="bg-card/50 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Durée de visionnage moyenne prédite
                      </span>
                      <span className="text-lg font-semibold">
                        {analysis.retention.predictedAvgViewDuration}
                      </span>
                    </div>
                    {analysis.retention.benchmarkVsNiche && (
                      <p className="text-muted-foreground mt-2 text-sm">
                        {analysis.retention.benchmarkVsNiche}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {analysis.retention.dropPoints &&
                      analysis.retention.dropPoints.length > 0 && (
                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
                          <h4 className="mb-3 flex items-center gap-2 font-medium text-rose-600">
                            <AlertTriangle className="size-4" />
                            Points de Décrochage
                          </h4>
                          <ul className="space-y-3">
                            {analysis.retention.dropPoints.map((point, i) => (
                              <li key={i} className="text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono">
                                    {point.timestamp}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-xs",
                                      point.severity === "critical" &&
                                        "bg-rose-500/30 text-rose-600",
                                      point.severity === "moderate" &&
                                        "bg-orange-500/30 text-orange-600",
                                      point.severity === "minor" &&
                                        "bg-amber-500/30 text-amber-600",
                                    )}
                                  >
                                    {point.severity}
                                  </span>
                                </div>
                                <p className="text-muted-foreground mt-1">
                                  {point.reason}
                                </p>
                                {point.quote && (
                                  <p className="text-muted-foreground mt-1 border-l-2 border-rose-500/50 pl-2 text-xs italic">
                                    &quot;{point.quote}&quot;
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {analysis.retention.peakMoments &&
                      analysis.retention.peakMoments.length > 0 && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                          <h4 className="mb-3 flex items-center gap-2 font-medium text-emerald-600">
                            <Star className="size-4" />
                            Pics d{"'"}Engagement
                          </h4>
                          <ul className="space-y-3">
                            {analysis.retention.peakMoments.map((peak, i) => (
                              <li key={i} className="text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono">
                                    {peak.timestamp}
                                  </span>
                                  {peak.replicable && (
                                    <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-xs text-emerald-600">
                                      Reproductible
                                    </span>
                                  )}
                                </div>
                                <p className="text-muted-foreground mt-1">
                                  {peak.reason}
                                </p>
                                {peak.quote && (
                                  <p className="text-muted-foreground mt-1 border-l-2 border-emerald-500/50 pl-2 text-xs italic">
                                    &quot;{peak.quote}&quot;
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                </div>
              </AnimatedCard>
            </BlurFade>
          )}

          {analysis.growth && (
            <BlurFade delay={0.55}>
              <AnimatedCard gradientFrom="#f59e0b" gradientTo="#ec4899">
                <div className="p-6">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                    <Rocket className="size-5" />
                    Opportunités de Croissance
                  </h3>

                  {analysis.growth.titleAnalysis && (
                    <div className="bg-card/50 mb-4 rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="font-medium">Analyse du Titre</h4>
                        <ScoreRing
                          score={analysis.growth.titleAnalysis.score}
                          size="sm"
                        />
                      </div>
                      <p className="text-muted-foreground mb-3 text-sm">
                        Actuel: &quot;{analysis.growth.titleAnalysis.current}
                        &quot;
                      </p>

                      {analysis.growth.titleAnalysis.issues.length > 0 && (
                        <div className="mb-3">
                          <p className="mb-1 text-sm font-medium text-rose-600">
                            Problèmes:
                          </p>
                          <ul className="text-muted-foreground text-sm">
                            {analysis.growth.titleAnalysis.issues.map(
                              (issue, i) => (
                                <li key={i}>• {issue}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}

                      {analysis.growth.titleAnalysis.suggestions.length > 0 && (
                        <div>
                          <p className="mb-1 text-sm font-medium text-emerald-600">
                            Suggestions:
                          </p>
                          <ul className="space-y-1">
                            {analysis.growth.titleAnalysis.suggestions.map(
                              (sug, i) => (
                                <li
                                  key={i}
                                  className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-sm"
                                >
                                  {sug}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    {analysis.growth.viralPotential && (
                      <div className="bg-card/50 rounded-lg border p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="font-medium">Potentiel Viral</h4>
                          <ScoreRing
                            score={analysis.growth.viralPotential.score}
                            size="sm"
                          />
                        </div>
                        {analysis.growth.viralPotential.factors.length > 0 && (
                          <div className="mb-2">
                            <p className="mb-1 text-xs font-medium text-emerald-600">
                              Présent:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {analysis.growth.viralPotential.factors.map(
                                (f, i) => (
                                  <span
                                    key={i}
                                    className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs"
                                  >
                                    {f}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                        {analysis.growth.viralPotential.missing.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-rose-600">
                              Manquant:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {analysis.growth.viralPotential.missing.map(
                                (m, i) => (
                                  <span
                                    key={i}
                                    className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs"
                                  >
                                    {m}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {analysis.growth.seoKeywords &&
                      analysis.growth.seoKeywords.length > 0 && (
                        <div className="bg-card/50 rounded-lg border p-4">
                          <h4 className="mb-3 flex items-center gap-2 font-medium">
                            <Tag className="size-4" />
                            Mots-clés SEO
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {analysis.growth.seoKeywords.map((kw, i) => (
                              <span
                                key={i}
                                className="bg-muted rounded-full px-3 py-1 text-sm"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>

                  {analysis.growth.thumbnailIdeas &&
                    analysis.growth.thumbnailIdeas.length > 0 && (
                      <div className="bg-card/50 mt-4 rounded-lg border p-4">
                        <h4 className="mb-3 font-medium">Idées de Thumbnail</h4>
                        <ul className="space-y-2">
                          {analysis.growth.thumbnailIdeas.map((idea, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm"
                            >
                              <span className="bg-primary/20 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                                {i + 1}
                              </span>
                              {idea}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {analysis.growth.monetizationAngles &&
                    analysis.growth.monetizationAngles.length > 0 && (
                      <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                        <h4 className="mb-3 flex items-center gap-2 font-medium text-amber-600">
                          <MessageSquare className="size-4" />
                          Angles de Monétisation
                        </h4>
                        <ul className="space-y-1 text-sm">
                          {analysis.growth.monetizationAngles.map(
                            (angle, i) => (
                              <li key={i}>• {angle}</li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                </div>
              </AnimatedCard>
            </BlurFade>
          )}

          {analysis.insights && analysis.insights.length > 0 && (
            <BlurFade delay={0.6}>
              <AnimatedCard gradientFrom="#8b5cf6" gradientTo="#06b6d4">
                <div className="p-6">
                  <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold">
                    <Lightbulb className="size-5" />
                    Insights Actionnables
                  </h3>
                  <p className="text-muted-foreground mb-4 text-sm">
                    Classés par priorité et impact
                  </p>

                  <div className="space-y-3">
                    {analysis.insights.map((insight, i) => (
                      <div
                        key={i}
                        className={cn(
                          "bg-card/50 rounded-lg border p-4",
                          insight.priority === "critical" &&
                            "border-rose-500/30",
                          insight.priority === "high" && "border-orange-500/30",
                          insight.priority === "medium" &&
                            "border-amber-500/30",
                          insight.priority === "low" && "border-muted",
                        )}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium uppercase",
                              insight.priority === "critical" &&
                                "bg-rose-500/20 text-rose-600",
                              insight.priority === "high" &&
                                "bg-orange-500/20 text-orange-600",
                              insight.priority === "medium" &&
                                "bg-amber-500/20 text-amber-600",
                              insight.priority === "low" &&
                                "bg-muted text-muted-foreground",
                            )}
                          >
                            {insight.priority}
                          </span>
                          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                            {insight.category}
                          </span>
                          <span
                            className={cn(
                              "ml-auto rounded-full px-2 py-0.5 text-xs",
                              insight.effort === "facile" &&
                                "bg-emerald-500/20 text-emerald-600",
                              insight.effort === "moyen" &&
                                "bg-amber-500/20 text-amber-600",
                              insight.effort === "difficile" &&
                                "bg-rose-500/20 text-rose-600",
                            )}
                          >
                            {insight.effort}
                          </span>
                        </div>
                        <p className="font-medium">{insight.action}</p>
                        {insight.expectedImpact && (
                          <p className="text-muted-foreground mt-1 text-sm">
                            Impact: {insight.expectedImpact}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </AnimatedCard>
            </BlurFade>
          )}

          {analysis.growth?.contentGaps &&
            analysis.growth.contentGaps.length > 0 && (
              <BlurFade delay={0.65}>
                <AnimatedCard gradientFrom="#ec4899" gradientTo="#8b5cf6">
                  <div className="p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                      <Target className="size-5" />
                      Gaps de Contenu (Idées de Vidéos Futures)
                    </h3>
                    <ul className="space-y-2">
                      {analysis.growth.contentGaps.map((gap, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Sparkles className="text-primary mt-0.5 size-4 shrink-0" />
                          <span>{gap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </AnimatedCard>
              </BlurFade>
            )}
        </div>
      )}

      {step === "analyzing" && !analysis && streamingText && (
        <BlurFade delay={0.3}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="size-5 animate-spin" />
                Analyse en cours...
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/50 rounded-lg p-4">
                <pre className="text-muted-foreground text-sm whitespace-pre-wrap">
                  {streamingText}
                </pre>
              </div>
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {step === "idle" && (
        <BlurFade delay={0.2}>
          <AnimatedCard
            className="border-dashed"
            gradientFrom="#6366f1"
            gradientTo="#ec4899"
          >
            <div className="flex flex-col items-center justify-center px-6 py-16">
              <div className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/10 ring-1 ring-red-500/10">
                <Youtube className="size-10 text-red-500/70" />
              </div>
              <h3 className="mb-2 text-lg font-medium">Prêt à analyser</h3>
              <p className="text-muted-foreground max-w-md text-center text-sm">
                Obtenez une analyse pro de votre vidéo: hook, structure,
                rétention, opportunités de croissance et insights actionnables
                pour faire décoller votre chaîne.
              </p>
            </div>
          </AnimatedCard>
        </BlurFade>
      )}
    </div>
  );
}
