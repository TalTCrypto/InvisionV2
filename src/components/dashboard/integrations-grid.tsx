"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  TrendingUp,
  Eye,
  Video,
  Heart,
  MessageCircle,
  TrendingDown,
  TrendingUp as TrendingUpIcon,
  Image as ImageIcon,
} from "lucide-react";

import { AnimatedCard } from "~/components/ui/animated-card";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { getIntegrationIcon } from "~/app/onboarding/integrations/integration-icons";
import { cn } from "~/lib/utils";

function normalizeSlug(slug: string) {
  return slug.toLowerCase().replace(/-/g, "");
}

// Mini graphique de tendance SVG
function MiniTrendChart({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 60;
  const height = 20;
  const padding = 2;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y =
      height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const path = `M ${points.join(" L ")}`;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      />
    </svg>
  );
}

// Widget YouTube avec graphique et métriques avancées
function YouTubeWidget({
  integration,
  metrics,
  isLoading,
}: {
  integration: { slug: string; name?: string; logo?: string };
  metrics: {
    subscribers?: number;
    views?: number;
    videos?: number;
    latestVideos?: Array<{
      id: string;
      title: string;
      viewCount?: number;
      likeCount?: number;
    }>;
    avgViewsPerVideo?: number;
    engagementRate?: number;
    totalLikes?: number;
    totalComments?: number;
  } | null;
  isLoading: boolean;
}) {
  const Icon = getIntegrationIcon(integration.slug);

  const formatMetric = (value: number | undefined) => {
    if (value === undefined || value === null) return "--";
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const youtubeMetrics = metrics as {
    subscribers?: number;
    views?: number;
    videos?: number;
    latestVideos?: Array<{
      id: string;
      title: string;
      viewCount?: number;
      likeCount?: number;
    }>;
    avgViewsPerVideo?: number;
    engagementRate?: number;
    totalLikes?: number;
    totalComments?: number;
  } | null;

  // Générer des données de tendance pour le graphique (simulation)
  const trendData = useMemo(() => {
    if (!youtubeMetrics) return [];
    const base = youtubeMetrics.subscribers ?? 0;
    return Array.from({ length: 7 }, (_, i) => {
      const variation = (Math.sin(i) * 0.1 + Math.random() * 0.05) * base;
      return Math.max(0, base + variation);
    });
  }, [youtubeMetrics]);

  if (isLoading || !metrics || !youtubeMetrics) {
    return (
      <div className="border-border bg-muted col-span-2 row-span-3 h-full animate-pulse rounded-xl border" />
    );
  }

  const latestVideo = youtubeMetrics.latestVideos?.[0];
  const avgViews = youtubeMetrics.avgViewsPerVideo ?? 0;
  const latestVideoViews = latestVideo?.viewCount ?? 0;
  const performanceVsAvg =
    avgViews > 0 ? ((latestVideoViews - avgViews) / avgViews) * 100 : 0;

  return (
    <Link href={`/dashboard/integrations/${integration.slug}`}>
      <AnimatedCard className="group flex h-full cursor-pointer flex-col overflow-hidden transition-all duration-300">
        <div className="flex h-full flex-col px-7 py-6">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
                {integration.logo ? (
                  <img
                    src={integration.logo}
                    alt={integration.name}
                    className="size-8 object-contain"
                  />
                ) : (
                  <Icon className="size-8" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {integration.name ?? "YouTube"}
                </h3>
                <p className="text-muted-foreground text-xs">Connecté</p>
              </div>
            </div>
            <ArrowUpRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>

          {/* Métrique principale avec graphique */}
          <div className="mb-4 flex items-end justify-between">
            <div className="pl-0">
              <p className="text-4xl font-bold tracking-tight">
                {formatMetric(youtubeMetrics.subscribers)}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">Abonnés</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex h-[2.5rem] flex-col justify-end text-right">
                {youtubeMetrics.engagementRate ? (
                  <>
                    <p className="text-xl leading-tight font-semibold text-green-600">
                      {youtubeMetrics.engagementRate.toFixed(1)}%
                    </p>
                    <p className="text-muted-foreground text-xs leading-tight">
                      Engagement
                    </p>
                  </>
                ) : (
                  <div className="h-[2.5rem]" />
                )}
              </div>
              <MiniTrendChart data={trendData} className="text-primary" />
            </div>
          </div>

          {/* Grille de métriques */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="border-border/50 bg-muted/30 rounded-lg border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Eye className="text-muted-foreground size-3.5" />
                <p className="text-muted-foreground text-xs font-medium">
                  Vues moy.
                </p>
              </div>
              <p className="text-xl font-bold">
                {formatMetric(youtubeMetrics.avgViewsPerVideo)}
              </p>
            </div>
            <div className="border-border/50 bg-muted/30 rounded-lg border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Video className="text-muted-foreground size-3.5" />
                <p className="text-muted-foreground text-xs font-medium">
                  Vidéos
                </p>
              </div>
              <p className="text-xl font-bold">
                {formatMetric(youtubeMetrics.videos)}
              </p>
            </div>
            <div className="border-border/50 bg-muted/30 rounded-lg border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Heart className="text-muted-foreground size-3.5" />
                <p className="text-muted-foreground text-xs font-medium">
                  Likes
                </p>
              </div>
              <p className="text-xl font-bold">
                {formatMetric(youtubeMetrics.totalLikes)}
              </p>
            </div>
            <div className="border-border/50 bg-muted/30 rounded-lg border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <MessageCircle className="text-muted-foreground size-3.5" />
                <p className="text-muted-foreground text-xs font-medium">
                  Commentaires
                </p>
              </div>
              <p className="text-xl font-bold">
                {formatMetric(youtubeMetrics.totalComments)}
              </p>
            </div>
          </div>

          {/* Dernière vidéo */}
          {latestVideo && (
            <div className="border-border/50 bg-muted/30 mt-auto rounded-lg border p-3">
              <div className="mb-2 flex items-start justify-between">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Dernière vidéo
                </p>
                {performanceVsAvg !== 0 && (
                  <div className="flex items-center gap-1.5">
                    {performanceVsAvg > 0 ? (
                      <>
                        <TrendingUpIcon className="size-3 text-green-600" />
                        <span className="text-xs font-semibold text-green-600">
                          +{Math.abs(performanceVsAvg).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="size-3 text-red-600" />
                        <span className="text-xs font-semibold text-red-600">
                          {Math.abs(performanceVsAvg).toFixed(0)}%
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="mb-2 line-clamp-2 text-sm leading-snug font-medium">
                {latestVideo.title}
              </p>
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <Eye className="size-3" />
                  {formatMetric(latestVideo.viewCount)} vues
                </span>
                {latestVideo.likeCount && (
                  <span className="flex items-center gap-1.5">
                    <Heart className="size-3" />
                    {formatMetric(latestVideo.likeCount)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </AnimatedCard>
    </Link>
  );
}

// Widget Instagram avec graphique et métriques avancées
function InstagramWidget({
  integration,
  metrics,
  isLoading,
}: {
  integration: { slug: string; name?: string; logo?: string };
  metrics: {
    followers?: number;
    posts?: number;
    reach?: number;
    engagementRate?: number;
    totalLikes?: number;
    totalComments?: number;
    avgLikesPerPost?: number;
    latestPosts?: Array<{
      id: string;
      caption?: string;
      likeCount?: number;
      commentCount?: number;
    }>;
  } | null;
  isLoading: boolean;
}) {
  const Icon = getIntegrationIcon(integration.slug);

  const formatMetric = (value: number | undefined) => {
    if (value === undefined || value === null) return "--";
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const instagramMetrics = metrics as {
    status?: string;
    followers?: number;
    posts?: number;
    reach?: number;
    engagementRate?: number;
    totalLikes?: number;
    totalComments?: number;
    avgLikesPerPost?: number;
    latestPosts?: Array<{
      id: string;
      caption?: string;
      likeCount?: number;
      commentCount?: number;
    }>;
  } | null;

  // Générer des données de tendance pour le graphique (simulation)
  const trendData = useMemo(() => {
    if (!instagramMetrics) return [];
    const base = instagramMetrics.followers ?? 0;
    return Array.from({ length: 7 }, (_, i) => {
      const variation = (Math.sin(i) * 0.1 + Math.random() * 0.05) * base;
      return Math.max(0, base + variation);
    });
  }, [instagramMetrics]);

  if (
    isLoading ||
    !metrics ||
    !instagramMetrics ||
    instagramMetrics.status === "error"
  ) {
    return (
      <div className="border-border bg-muted col-span-2 row-span-3 h-full animate-pulse rounded-xl border" />
    );
  }

  const latestPost = instagramMetrics.latestPosts?.[0];
  const avgLikes = instagramMetrics.avgLikesPerPost ?? 0;
  const latestPostLikes = latestPost?.likeCount ?? 0;
  const performanceVsAvg =
    avgLikes > 0 ? ((latestPostLikes - avgLikes) / avgLikes) * 100 : 0;

  return (
    <Link href={`/dashboard/integrations/${integration.slug}`}>
      <AnimatedCard className="group flex h-full cursor-pointer flex-col overflow-hidden transition-all duration-300">
        <div className="flex h-full flex-col px-7 py-6">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
                {integration.logo ? (
                  <img
                    src={integration.logo}
                    alt={integration.name}
                    className="size-8 object-contain"
                  />
                ) : (
                  <Icon className="size-8" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {integration.name ?? "Instagram"}
                </h3>
                <p className="text-muted-foreground text-xs">Connecté</p>
              </div>
            </div>
            <ArrowUpRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>

          {/* Métrique principale avec graphique */}
          <div className="mb-4 flex items-end justify-between">
            <div className="pl-0">
              <p className="text-4xl font-bold tracking-tight">
                {formatMetric(instagramMetrics.followers)}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">Abonnés</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex h-[2.5rem] flex-col justify-end text-right">
                {instagramMetrics.engagementRate ? (
                  <>
                    <p className="text-xl leading-tight font-semibold text-green-600">
                      {instagramMetrics.engagementRate.toFixed(1)}%
                    </p>
                    <p className="text-muted-foreground text-xs leading-tight">
                      Engagement
                    </p>
                  </>
                ) : (
                  <div className="h-[2.5rem]" />
                )}
              </div>
              <MiniTrendChart data={trendData} className="text-primary" />
            </div>
          </div>

          {/* Grille de métriques */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="border-border/50 bg-muted/30 rounded-lg border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <ImageIcon className="text-muted-foreground size-3.5" />
                <p className="text-muted-foreground text-xs font-medium">
                  Posts
                </p>
              </div>
              <p className="text-xl font-bold">
                {formatMetric(instagramMetrics.posts)}
              </p>
            </div>
            <div className="border-border/50 bg-muted/30 rounded-lg border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Eye className="text-muted-foreground size-3.5" />
                <p className="text-muted-foreground text-xs font-medium">
                  Portée
                </p>
              </div>
              <p className="text-xl font-bold">
                {formatMetric(instagramMetrics.reach)}
              </p>
            </div>
            <div className="border-border/50 bg-muted/30 rounded-lg border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Heart className="text-muted-foreground size-3.5" />
                <p className="text-muted-foreground text-xs font-medium">
                  Likes
                </p>
              </div>
              <p className="text-xl font-bold">
                {formatMetric(instagramMetrics.totalLikes)}
              </p>
            </div>
            <div className="border-border/50 bg-muted/30 rounded-lg border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <MessageCircle className="text-muted-foreground size-3.5" />
                <p className="text-muted-foreground text-xs font-medium">
                  Commentaires
                </p>
              </div>
              <p className="text-xl font-bold">
                {formatMetric(instagramMetrics.totalComments)}
              </p>
            </div>
          </div>

          {/* Dernier post */}
          {latestPost && (
            <div className="border-border/50 bg-muted/30 mt-auto rounded-lg border p-3">
              <div className="mb-2 flex items-start justify-between">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Dernier post
                </p>
                {performanceVsAvg !== 0 && (
                  <div className="flex items-center gap-1.5">
                    {performanceVsAvg > 0 ? (
                      <>
                        <TrendingUpIcon className="size-3 text-green-600" />
                        <span className="text-xs font-semibold text-green-600">
                          +{Math.abs(performanceVsAvg).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="size-3 text-red-600" />
                        <span className="text-xs font-semibold text-red-600">
                          {Math.abs(performanceVsAvg).toFixed(0)}%
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="mb-2 line-clamp-2 text-sm leading-snug font-medium">
                {latestPost.caption ?? "Post Instagram"}
              </p>
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <Heart className="size-3" />
                  {formatMetric(latestPost.likeCount)} likes
                </span>
                {latestPost.commentCount && (
                  <span className="flex items-center gap-1.5">
                    <MessageCircle className="size-3" />
                    {formatMetric(latestPost.commentCount)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </AnimatedCard>
    </Link>
  );
}

// Widget générique pour les autres intégrations
function GenericWidget({
  integration,
  isLoading,
  size = "normal",
}: {
  integration: { slug: string; name?: string; logo?: string };
  isLoading: boolean;
  size?: "small" | "normal" | "large";
}) {
  const Icon = getIntegrationIcon(integration.slug);

  const sizeClasses = {
    small: "col-span-1 row-span-1",
    normal: "col-span-1 row-span-1",
    large: "col-span-2 row-span-1",
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          "border-border bg-muted h-full animate-pulse rounded-xl border",
          sizeClasses[size],
        )}
      />
    );
  }

  return (
    <Link href={`/dashboard/integrations/${integration.slug}`}>
      <AnimatedCard
        className={cn(
          "group flex h-full cursor-pointer flex-col overflow-hidden transition-all duration-300",
          sizeClasses[size],
        )}
      >
        <div className="flex h-full flex-col p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="bg-muted flex size-9 items-center justify-center rounded-lg">
                {integration.logo ? (
                  <img
                    src={integration.logo}
                    alt={integration.name}
                    className="size-5 object-contain"
                  />
                ) : (
                  <Icon className="size-5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold">
                  {integration.name ?? "Intégration"}
                </h3>
                <p className="text-muted-foreground text-[10px]">Connecté</p>
              </div>
            </div>
            <ArrowUpRight className="text-muted-foreground size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>

          <div className="mt-auto pt-2">
            <div className="flex items-center gap-1.5">
              <div className="rounded-full bg-green-500/20 p-1.5">
                <div className="size-1.5 rounded-full bg-green-500" />
              </div>
              <div>
                <p className="text-lg font-bold">✓</p>
                <p className="text-muted-foreground text-[10px]">Actif</p>
              </div>
            </div>
          </div>
        </div>
      </AnimatedCard>
    </Link>
  );
}

export function IntegrationsGrid() {
  const { data: integrations, isLoading: isLoadingIntegrations } =
    api.integrations.list.useQuery();
  const { data: connectedIntegrations } =
    api.integrations.getConnected.useQuery();

  const connected = useMemo(() => {
    if (!integrations || !connectedIntegrations) return [];

    const connectedSlugs = new Set(connectedIntegrations.map(normalizeSlug));

    return integrations.filter((integration) =>
      connectedSlugs.has(normalizeSlug(integration.slug)),
    );
  }, [integrations, connectedIntegrations]);

  // Séparer YouTube, Instagram et les autres intégrations (calculé de manière stable)
  const {
    youtubeIntegration,
    instagramIntegration,
    otherIntegrations,
    youtubeSlug,
    instagramSlug,
  } = useMemo(() => {
    const youtube = connected.find(
      (int) => normalizeSlug(int.slug) === "youtube",
    );
    const instagram = connected.find(
      (int) => normalizeSlug(int.slug) === "instagram",
    );
    const others = connected.filter((int) => {
      const slug = normalizeSlug(int.slug);
      return slug !== "youtube" && slug !== "instagram";
    });
    return {
      youtubeIntegration: youtube,
      instagramIntegration: instagram,
      otherIntegrations: others,
      youtubeSlug: youtube?.slug ?? "",
      instagramSlug: instagram?.slug ?? "",
    };
  }, [connected]);

  // Récupérer les métriques YouTube avec cache agressif
  const { data: youtubeMetrics, isLoading: isLoadingYouTube } =
    api.integrations.getYouTubeMetrics.useQuery(
      { integrationKey: youtubeSlug },
      {
        enabled: !!youtubeIntegration && youtubeSlug !== "",
        staleTime: 1000 * 60 * 5, // 5 minutes (métriques changent peu)
        gcTime: 1000 * 60 * 30, // 30 minutes
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    );

  // Récupérer les métriques Instagram avec cache agressif
  const { data: instagramMetrics, isLoading: isLoadingInstagram } =
    api.integrations.getInstagramMetrics.useQuery(
      { integrationKey: instagramSlug },
      {
        enabled: !!instagramIntegration && instagramSlug !== "",
        staleTime: 1000 * 60 * 5, // 5 minutes (métriques changent peu)
        gcTime: 1000 * 60 * 30, // 30 minutes
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    );

  if (isLoadingIntegrations) {
    return (
      <div className="grid auto-rows-[200px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-border bg-muted h-full animate-pulse rounded-xl border"
          />
        ))}
      </div>
    );
  }

  if (connected.length === 0) {
    return (
      <div className="border-border bg-muted/30 flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
        <TrendingUp className="text-muted-foreground mb-4 size-12" />
        <h3 className="mb-2 text-lg font-semibold">
          Aucune intégration connectée
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md text-center text-sm">
          Connectez vos premières intégrations pour voir vos données et
          métriques ici
        </p>
        <Link href="/dashboard/integrations">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium">
            Voir les intégrations
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid auto-rows-[200px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Widget YouTube (2x3) */}
      {youtubeIntegration && (
        <div className="col-span-2 row-span-3">
          <YouTubeWidget
            integration={youtubeIntegration}
            metrics={youtubeMetrics ?? null}
            isLoading={isLoadingYouTube}
          />
        </div>
      )}

      {/* Widget Instagram (2x3) */}
      {instagramIntegration && (
        <div className="col-span-2 row-span-3">
          <InstagramWidget
            integration={instagramIntegration}
            metrics={instagramMetrics ?? null}
            isLoading={isLoadingInstagram}
          />
        </div>
      )}

      {/* Autres intégrations - limitées à 1 colonne chacune */}
      {otherIntegrations.slice(0, 2).map((integration) => (
        <GenericWidget
          key={integration.slug}
          integration={integration}
          isLoading={false}
          size="normal"
        />
      ))}
    </div>
  );
}
