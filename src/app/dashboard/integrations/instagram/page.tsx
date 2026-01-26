"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Instagram,
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
  AlertTriangle,
  Star,
  Rocket,
  Tag,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Play,
  RefreshCw,
  Heart,
  Hash,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { AnimatedCard } from "~/components/ui/animated-card";
import { BlurFade } from "~/components/ui/blur-fade";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

interface ContentFormat {
  primary: string;
  confidence: number;
  characteristics: string[];
  expectedHookStyle: string;
}

interface PsychologicalTrigger {
  type: string;
  strength: number;
  mechanism: string;
  brainArea: string;
  example: string;
}

interface HookAnalysis {
  score: number;
  verdict: string;
  contentFormat?: ContentFormat;
  psychologicalTriggers?: PsychologicalTrigger[];
  strengths: string[];
  weaknesses: string[];
  suggestion: string;
  firstWords: string;
  exactQuotes?: string[];
  expertDiagnosis?: string;
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

interface ViralPotential {
  score: number;
  replicabilityScore: number;
  trendingElements: string[];
  suggestedHashtags: string[];
  viralFactorsPresent: string[];
  viralFactorsMissing: string[];
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
  retention?: RetentionAnalysis;
  viralPotential?: ViralPotential;
  insights?: ActionableInsight[];
  quickWins?: string[];
  keyPoints?: string[];
  topics?: string[];
  targetAudience?: string;
  recommendations?: string[];
  reelDuration?: string;
}

interface ReelMetadata {
  reelId: string;
  username?: string;
  caption?: string;
  likeCount?: number;
  commentCount?: number;
  playCount?: number;
  timestamp?: string;
  duration?: number;
  mediaType?: string;
  permalink?: string;
}

type AnalysisStep = "idle" | "fetching" | "analyzing" | "complete" | "error";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function extractReelIdFromUrl(url: string): string | null {
  const patterns = [
    /instagram\.com\/reel\/([a-zA-Z0-9_-]+)/,
    /instagram\.com\/p\/([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]+)$/,
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

export default function InstagramReelsAnalysisPage() {
  const [reelUrl, setReelUrl] = useState("");
  const [step, setStep] = useState<AnalysisStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ReelMetadata | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentStatus, setCurrentStatus] = useState("");
  const [isCached, setIsCached] = useState(false);

  const getTranscript = api.instagram.getReelTranscript.useQuery(
    { urlOrId: reelUrl, withTimestamps: true },
    { enabled: false },
  );

  const startAnalysis = useCallback(
    async (forceRefresh = false) => {
      if (!reelUrl.trim()) return;

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

        const forceRefreshParam = forceRefresh ? "&forceRefresh=true" : "";
        const eventSource = new EventSource(
          `/api/instagram/analyze?reelId=${encodeURIComponent(reelUrl)}&language=fr${forceRefreshParam}`,
        );

        eventSource.addEventListener(
          "metadata",
          (event: MessageEvent<string>) => {
            const data = JSON.parse(event.data) as ReelMetadata & {
              cached?: boolean;
              cachedAt?: number;
            };
            setMetadata((prev) => ({ ...prev, ...data }));
            if (data.cached) {
              setIsCached(true);
            }
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
    [reelUrl, getTranscript, step],
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
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-600/10 ring-1 ring-pink-500/20">
              <Instagram className="size-8 text-pink-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Analyse Instagram Reels Pro
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
          gradientFrom="#ec4899"
          gradientTo="#8b5cf6"
        >
          <div className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Search className="text-muted-foreground size-5" />
              <h2 className="text-lg font-semibold">Analyser un Reel</h2>
            </div>
            <p className="text-muted-foreground mb-4 text-sm">
              Obtenez une analyse détaillée: hook (3s), rétention, potentiel
              viral, hashtags optimaux
            </p>
            <div className="flex gap-3">
              <Input
                placeholder="https://instagram.com/reel/... ou ID du reel"
                value={reelUrl}
                onChange={(e) => setReelUrl(e.target.value)}
                className="flex-1"
                disabled={step === "fetching" || step === "analyzing"}
              />
              <Button
                onClick={() => startAnalysis(false)}
                disabled={
                  !reelUrl.trim() || step === "fetching" || step === "analyzing"
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
            gradientFrom="#ec4899"
            gradientTo="#8b5cf6"
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {metadata.username && (
                      <h2 className="text-xl font-semibold">
                        @{metadata.username}
                      </h2>
                    )}
                  </div>
                  {metadata.caption && (
                    <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                      {metadata.caption}
                    </p>
                  )}
                  <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-sm">
                    {metadata.duration != null && (
                      <span className="text-foreground flex items-center gap-1.5 font-medium">
                        <Clock className="size-4" />
                        {formatDuration(metadata.duration)}
                      </span>
                    )}
                    {metadata.likeCount != null && (
                      <span className="flex items-center gap-1.5">
                        <Heart className="size-4" />
                        {formatNumber(metadata.likeCount.toString())} likes
                      </span>
                    )}
                    {metadata.commentCount != null && (
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="size-4" />
                        {formatNumber(metadata.commentCount.toString())}{" "}
                        commentaires
                      </span>
                    )}
                    {metadata.timestamp && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-4" />
                        {new Date(metadata.timestamp).toLocaleDateString(
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
                gradientFrom="#ec4899"
                gradientTo="#8b5cf6"
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
                      Analyse du Hook (3 premières secondes)
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

                  {analysis.hookAnalysis.contentFormat && (
                    <div className="mt-4 rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
                      <h4 className="mb-2 flex items-center gap-2 font-medium text-purple-600">
                        <Target className="size-4" />
                        Format Détecté
                      </h4>
                      <div className="space-y-2 text-sm">
                        <p>
                          <span className="font-medium">Type:</span>{" "}
                          <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium uppercase">
                            {analysis.hookAnalysis.contentFormat.primary}
                          </span>{" "}
                          <span className="text-muted-foreground text-xs">
                            (confiance:{" "}
                            {analysis.hookAnalysis.contentFormat.confidence}%)
                          </span>
                        </p>
                        <p>
                          <span className="font-medium">Hook attendu:</span>{" "}
                          {
                            analysis.hookAnalysis.contentFormat
                              .expectedHookStyle
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  {analysis.hookAnalysis.psychologicalTriggers &&
                    analysis.hookAnalysis.psychologicalTriggers.length > 0 && (
                      <div className="mt-4 rounded-lg border border-pink-500/20 bg-pink-500/5 p-4">
                        <h4 className="mb-3 flex items-center gap-2 font-medium text-pink-600">
                          <Sparkles className="size-4" />
                          Déclencheurs Psychologiques
                        </h4>
                        <div className="space-y-3">
                          {analysis.hookAnalysis.psychologicalTriggers.map(
                            (trigger, i) => (
                              <div
                                key={i}
                                className="bg-background/50 rounded-lg border-l-4 border-pink-500/50 p-3"
                              >
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="font-medium text-pink-600 capitalize">
                                    {trigger.type.replace(/_/g, " ")}
                                  </span>
                                  <span className="text-muted-foreground text-xs">
                                    Force: {trigger.strength}/10
                                  </span>
                                </div>
                                <p className="text-muted-foreground text-xs">
                                  {trigger.brainArea} • {trigger.mechanism}
                                </p>
                                {trigger.example && (
                                  <p className="mt-1 border-l-2 border-pink-500/30 pl-2 text-xs italic">
                                    &quot;{trigger.example}&quot;
                                  </p>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                  {analysis.hookAnalysis.expertDiagnosis && (
                    <div className="mt-4 rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-4">
                      <h4 className="mb-2 flex items-center gap-2 font-medium text-amber-600">
                        <Star className="size-4" />
                        Diagnostic Expert
                      </h4>
                      <p className="text-sm leading-relaxed">
                        {analysis.hookAnalysis.expertDiagnosis}
                      </p>
                    </div>
                  )}
                </div>
              </AnimatedCard>
            </BlurFade>
          )}

          {analysis.retention && (
            <BlurFade delay={0.45}>
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

          {analysis.viralPotential && (
            <BlurFade delay={0.5}>
              <AnimatedCard gradientFrom="#ec4899" gradientTo="#8b5cf6">
                <div className="p-6">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                    <Rocket className="size-5" />
                    Potentiel Viral
                  </h3>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="bg-card/50 rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="font-medium">Score Viral</h4>
                        <ScoreRing
                          score={analysis.viralPotential.score}
                          size="sm"
                        />
                      </div>
                      {analysis.viralPotential.viralFactorsPresent.length >
                        0 && (
                        <div className="mb-2">
                          <p className="mb-1 text-xs font-medium text-emerald-600">
                            Présent:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {analysis.viralPotential.viralFactorsPresent.map(
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
                      {analysis.viralPotential.viralFactorsMissing.length >
                        0 && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-rose-600">
                            Manquant:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {analysis.viralPotential.viralFactorsMissing.map(
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

                    <div className="bg-card/50 rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="font-medium">Réplicabilité</h4>
                        <ScoreRing
                          score={analysis.viralPotential.replicabilityScore}
                          size="sm"
                        />
                      </div>
                      <p className="text-muted-foreground text-sm">
                        À quel point ce style peut être reproduit
                      </p>
                    </div>
                  </div>

                  {analysis.viralPotential.trendingElements &&
                    analysis.viralPotential.trendingElements.length > 0 && (
                      <div className="bg-card/50 mt-4 rounded-lg border p-4">
                        <h4 className="mb-3 flex items-center gap-2 font-medium">
                          <Sparkles className="size-4" />
                          Éléments Tendance Détectés
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {analysis.viralPotential.trendingElements.map(
                            (element, i) => (
                              <span
                                key={i}
                                className="rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 px-3 py-1 text-sm font-medium"
                              >
                                {element}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                  {analysis.viralPotential.suggestedHashtags &&
                    analysis.viralPotential.suggestedHashtags.length > 0 && (
                      <div className="bg-card/50 mt-4 rounded-lg border p-4">
                        <h4 className="mb-3 flex items-center gap-2 font-medium">
                          <Hash className="size-4" />
                          Hashtags Suggérés
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {analysis.viralPotential.suggestedHashtags.map(
                            (hashtag, i) => (
                              <span
                                key={i}
                                className="rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 px-3 py-1 text-sm font-medium text-pink-600"
                              >
                                {hashtag.startsWith("#")
                                  ? hashtag
                                  : `#${hashtag}`}
                              </span>
                            ),
                          )}
                        </div>
                        <p className="text-muted-foreground mt-2 text-xs">
                          micro: 10K-100K posts • medium: 100K-1M posts • large:
                          1M+ posts
                        </p>
                      </div>
                    )}
                </div>
              </AnimatedCard>
            </BlurFade>
          )}

          {analysis.insights && analysis.insights.length > 0 && (
            <BlurFade delay={0.55}>
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
            gradientFrom="#ec4899"
            gradientTo="#8b5cf6"
          >
            <div className="flex flex-col items-center justify-center px-6 py-16">
              <div className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/10 ring-1 ring-pink-500/10">
                <Instagram className="size-10 text-pink-500/70" />
              </div>
              <h3 className="mb-2 text-lg font-medium">Prêt à analyser</h3>
              <p className="text-muted-foreground max-w-md text-center text-sm">
                Obtenez une analyse pro de votre Reel: hook (3s), rétention,
                potentiel viral, hashtags optimaux et insights actionnables pour
                faire exploser votre reach.
              </p>
            </div>
          </AnimatedCard>
        </BlurFade>
      )}
    </div>
  );
}
