import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getComposioClient } from "~/server/utils/composio";
import {
  getCachedConnectedAccounts,
  getCachedToolkit,
} from "~/server/utils/composio-cache";

/**
 * Liste des intégrations autorisées (limitées pour l'instant)
 * Mapping: slug Composio (normalisé) -> nom d'affichage
 */
const ALLOWED_INTEGRATIONS: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  twitter: "Twitter",
  linkedin: "LinkedIn",
  facebook: "Meta Ads",
  "google-calendar": "Google Calendar",
  googlecalendar: "Google Calendar",
  notion: "Notion",
  slack: "Slack",
  shopify: "Shopify",
  stripe: "Stripe",
};

/**
 * Normalise un slug pour la comparaison (enlève les tirets, met en minuscule)
 */
function normalizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/-/g, "");
}

export const integrationsRouter = createTRPCRouter({
  /**
   * Récupérer les intégrations disponibles depuis Composio (limitées à la liste autorisée)
   */
  list: protectedProcedure.query(async () => {
    try {
      const composio = getComposioClient();
      const toolkits = await composio.toolkits.get({});

      // La réponse est directement un tableau selon ToolKitListResponseSchema
      const toolkitsArray = Array.isArray(toolkits) ? toolkits : [];

      // Filtrer pour ne garder que les intégrations autorisées
      const allowedNormalizedSlugs = new Set(
        Object.keys(ALLOWED_INTEGRATIONS).map(normalizeSlug),
      );

      const filteredToolkits = toolkitsArray.filter((toolkit) => {
        if (!toolkit?.slug) return false;
        const normalizedSlug = normalizeSlug(toolkit.slug);
        return allowedNormalizedSlugs.has(normalizedSlug);
      });

      return filteredToolkits.map((toolkit) => {
        const normalizedSlug = normalizeSlug(toolkit.slug ?? "");
        // Trouver la clé correspondante dans ALLOWED_INTEGRATIONS
        const displayNameKey = Object.keys(ALLOWED_INTEGRATIONS).find(
          (key) => normalizeSlug(key) === normalizedSlug,
        );

        return {
          slug: toolkit.slug ?? "",
          name: displayNameKey
            ? ALLOWED_INTEGRATIONS[displayNameKey]
            : (toolkit.name ?? "Unknown"),
          logo: toolkit.meta?.logo ?? undefined,
        };
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des intégrations:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Détails de l'erreur:", errorMessage);

      // Retourner un tableau vide en cas d'erreur plutôt que de faire échouer la requête
      return [];
    }
  }),

  /**
   * Obtenir les intégrations connectées de l'utilisateur
   */
  getConnected: protectedProcedure.query(async ({ ctx }) => {
    try {
      const composio = getComposioClient();
      const userId = ctx.session.user.id;

      // Utiliser le cache pour les comptes connectés
      const connectedAccounts = await getCachedConnectedAccounts(
        composio,
        userId,
      );

      // Ne retourner que les comptes actifs
      const activeAccounts = connectedAccounts.filter(
        (account) => account.status === "ACTIVE",
      );

      return activeAccounts.map((account) => {
        // Utiliser le slug du toolkit si disponible
        const slug = account.toolkit?.slug ?? "";
        return slug;
      });
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des intégrations connectées:",
        error,
      );
      // En cas d'erreur, retourner un tableau vide plutôt que de faire échouer la requête
      return [] as string[];
    }
  }),

  /**
   * Connecter une intégration via Composio
   */
  connect: protectedProcedure
    .input(
      z.object({
        integrationKey: z.string().min(1, "La clé d'intégration est requise"),
        returnTo: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const composio = getComposioClient();
        const userId = ctx.session.user.id;
        const userEmail = ctx.session.user.email;
        const toolkitSlug = input.integrationKey;

        // Log pour vérifier l'identification de l'utilisateur
        console.log(`[connect] ========================================`);
        console.log(
          `[connect] Utilisateur identifié: ${userId} (${userEmail})`,
        );
        console.log(
          `[connect] 🔗 Tentative de connexion pour: "${toolkitSlug}"`,
        );
        console.log(
          `[connect] Slug reçu depuis le frontend: "${input.integrationKey}"`,
        );

        // Vérifier si CET UTILISATEUR a déjà cette intégration connectée et active
        const normalizedSlug = normalizeSlug(toolkitSlug);
        const connectedAccounts = await composio.connectedAccounts.list({
          userIds: [userId], // UNIQUEMENT les comptes de cet utilisateur
        });

        console.log(
          `[connect] Comptes pour ${userId}: ${connectedAccounts.items.length}`,
        );
        console.log(
          `[connect] Recherche: ${toolkitSlug} (normalisé: ${normalizedSlug})`,
        );

        // Vérifier si CET UTILISATEUR a un compte ACTIF pour ce toolkit
        const activeAccount = connectedAccounts.items.find((account) => {
          const accountSlug = account.toolkit?.slug ?? "";
          const normalizedAccountSlug = normalizeSlug(accountSlug);
          const isActive = account.status === "ACTIVE";
          const matches = normalizedAccountSlug === normalizedSlug;
          console.log(
            `[connect] Compte: ${accountSlug} (${normalizedAccountSlug}) - Status: ${account.status} - Match: ${matches}`,
          );
          return matches && isActive;
        });

        if (activeAccount) {
          console.log(
            `[connect] ✅ Déjà connecté et actif: ${activeAccount.id}`,
          );
          return {
            authUrl: null,
            connected: true,
          };
        }

        // Récupérer le toolkit
        const toolkit = await composio.toolkits.get(toolkitSlug);
        console.log(`[connect] Toolkit: ${toolkit.slug} - ${toolkit.name}`);

        // ÉTAPE 1: Obtenir ou créer l'authConfig pour ce toolkit (partagé entre tous les utilisateurs)
        let authConfigId: string | undefined;
        console.log(
          `[connect] 🔍 Recherche d'authConfig pour toolkit: "${toolkitSlug}" (normalisé: "${normalizedSlug}")`,
        );

        // Lister tous les authConfigs et filtrer manuellement pour être sûr
        const allAuthConfigs = await composio.authConfigs.list();
        console.log(
          `[connect] Total authConfigs disponibles: ${allAuthConfigs.items.length}`,
        );

        // Filtrer pour trouver celui du bon toolkit
        const matchingAuthConfig = allAuthConfigs.items.find((config) => {
          const configSlug = config.toolkit?.slug ?? "";
          const normalizedConfigSlug = normalizeSlug(configSlug);
          const matches = normalizedConfigSlug === normalizedSlug;
          console.log(
            `[connect] AuthConfig ${config.id}: toolkit="${configSlug}" (${normalizedConfigSlug}) - Match: ${matches}`,
          );
          return matches;
        });

        if (matchingAuthConfig) {
          authConfigId = matchingAuthConfig.id;
          console.log(
            `[connect] ✅ AuthConfig existant trouvé pour ${toolkitSlug}: ${authConfigId}`,
          );
        } else {
          // Créer un nouvel authConfig géré par Composio
          console.log(
            `[connect] Aucun authConfig trouvé, création d'un nouveau...`,
          );
          // Utiliser authorize qui crée automatiquement l'authConfig et retourne l'URL
          const connectionRequest = await composio.toolkits.authorize(
            userId,
            toolkitSlug,
          );

          if (connectionRequest.redirectUrl) {
            console.log(
              `[connect] ✅ AuthConfig créé via authorize, redirection: ${connectionRequest.redirectUrl}`,
            );
            return {
              authUrl: connectionRequest.redirectUrl,
              connected: false,
            };
          }

          // Si authorize n'a pas retourné d'URL, récupérer l'authConfig créé et utiliser link
          console.log(
            `[connect] authorize n'a pas retourné d'URL, récupération de l'authConfig...`,
          );
          const newAuthConfigs = await composio.authConfigs.list({
            toolkit: toolkitSlug,
          });

          if (newAuthConfigs.items.length > 0) {
            authConfigId = newAuthConfigs.items[0]?.id;
            console.log(`[connect] AuthConfig créé récupéré: ${authConfigId}`);
          } else {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Impossible de créer l'authConfig",
            });
          }
        }

        if (!authConfigId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Impossible de créer ou trouver l'authConfig",
          });
        }

        // ÉTAPE 2: Vérifier que l'authConfig correspond bien au toolkit avant de l'utiliser
        console.log(
          `[connect] 🔍 Vérification de l'authConfig ${authConfigId}...`,
        );
        const authConfigDetails = await composio.authConfigs.get(authConfigId);
        const authConfigToolkitSlug = authConfigDetails.toolkit?.slug ?? "";
        const normalizedAuthConfigSlug = normalizeSlug(authConfigToolkitSlug);

        console.log(
          `[connect] AuthConfig toolkit: "${authConfigToolkitSlug}" (${normalizedAuthConfigSlug})`,
        );
        console.log(
          `[connect] Toolkit demandé: "${toolkitSlug}" (${normalizedSlug})`,
        );

        if (normalizedAuthConfigSlug !== normalizedSlug) {
          console.error(
            `[connect] ❌ ERREUR: L'authConfig ${authConfigId} ne correspond pas!`,
          );
          console.error(
            `[connect] Attendu: ${normalizedSlug}, Trouvé: ${normalizedAuthConfigSlug}`,
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `L'authConfig ne correspond pas au toolkit demandé (${toolkitSlug} vs ${authConfigToolkitSlug})`,
          });
        }

        // ÉTAPE 3: Connecter CET UTILISATEUR à cet authConfig
        const returnPath = input.returnTo ?? "/onboarding/integrations";
        const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/onboarding/integrations/callback?returnTo=${encodeURIComponent(returnPath)}`;
        console.log(
          `[connect] 🔗 Connexion de ${userId} à "${toolkitSlug}" via authConfig ${authConfigId}`,
        );
        console.log(`[connect] Callback URL: ${callbackUrl}`);

        const connectionRequest = await composio.connectedAccounts.link(
          userId, // L'utilisateur spécifique
          authConfigId, // L'authConfig partagé (vérifié)
          {
            callbackUrl,
          },
        );

        console.log(`[connect] ConnectionRequest créé:`, {
          id: connectionRequest.id,
          status: connectionRequest.status,
          redirectUrl: connectionRequest.redirectUrl,
        });

        if (!connectionRequest.redirectUrl) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Impossible de générer l'URL d'autorisation",
          });
        }

        console.log(
          `[connect] ✅ Redirection vers: ${connectionRequest.redirectUrl}`,
        );
        console.log(`[connect] ========================================`);
        return {
          authUrl: connectionRequest.redirectUrl,
          connected: false,
        };
      } catch (error) {
        console.error("Erreur lors de la connexion de l'intégration:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Impossible de connecter l'intégration",
        });
      }
    }),

  /**
   * Déconnecter une intégration
   */
  disconnect: protectedProcedure
    .input(
      z.object({
        integrationKey: z.string().min(1, "La clé d'intégration est requise"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const composio = getComposioClient();
        const userId = ctx.session.user.id;
        const toolkitSlug = input.integrationKey;
        const normalizedSlug = normalizeSlug(toolkitSlug);

        // Récupérer les comptes connectés pour cet utilisateur
        const connectedAccounts = await composio.connectedAccounts.list({
          userIds: [userId],
        });

        // Trouver le compte actif correspondant à cette intégration
        const accountToDelete = connectedAccounts.items.find((account) => {
          const accountSlug = account.toolkit?.slug ?? "";
          const normalizedAccountSlug = normalizeSlug(accountSlug);
          return (
            normalizedAccountSlug === normalizedSlug &&
            account.status === "ACTIVE"
          );
        });

        if (!accountToDelete) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Intégration non trouvée ou déjà déconnectée",
          });
        }

        // Supprimer le compte connecté
        await composio.connectedAccounts.delete(accountToDelete.id);

        return {
          success: true as const,
        };
      } catch (error) {
        console.error("Erreur lors de la déconnexion de l'intégration:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Impossible de déconnecter l'intégration",
        });
      }
    }),

  /**
   * Récupérer les métriques YouTube d'une intégration connectée
   */
  getYouTubeMetrics: protectedProcedure
    .input(
      z.object({
        integrationKey: z.string().min(1, "La clé d'intégration est requise"),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const composio = getComposioClient();
        const userId = ctx.session.user.id;
        const toolkitSlug = input.integrationKey;
        const normalizedSlug = normalizeSlug(toolkitSlug);

        if (normalizedSlug !== "youtube") {
          return null;
        }

        // Paralléliser la récupération du compte et du toolkit
        const results = await Promise.all([
          getCachedConnectedAccounts(composio, userId),
          getCachedToolkit(composio, "youtube"),
        ]);
        const connectedAccounts = results[0];
        const youtubeToolkit = results[1];

        const account = connectedAccounts.find((acc) => {
          const accountSlug = acc.toolkit?.slug ?? "";
          return (
            normalizeSlug(accountSlug) === normalizedSlug &&
            acc.status === "ACTIVE"
          );
        });

        if (!account) {
          return null;
        }

        const toolkitVersion = (
          youtubeToolkit as { meta?: { availableVersions?: string[] } }
        )?.meta?.availableVersions?.[0];

        console.log(
          `[YouTube Metrics] Début - userId: ${userId}, accountId: ${account.id}, version: ${toolkitVersion ?? "latest"}`,
        );

        // Utiliser Composio pour exécuter l'action YouTube
        // OPTIMISATION ULTRA: Paralléliser stats ET videos dès le début (pas besoin d'attendre stats)
        try {
          const version = toolkitVersion ?? "latest";
          const skipCheck = !toolkitVersion;

          const startTime = Date.now();
          console.log(
            `[YouTube Metrics] Lancement parallèle: GET_CHANNEL_STATISTICS + LIST_CHANNEL_VIDEOS`,
          );

          // Paralléliser stats et videos dès le début (mine:true pour stats, channelId:"me" pour videos)
          const [statsResult, videosResult] = await Promise.allSettled([
            composio.tools.execute("YOUTUBE_GET_CHANNEL_STATISTICS", {
              userId: userId,
              connectedAccountId: account.id,
              version,
              dangerouslySkipVersionCheck: skipCheck,
              arguments: {
                mine: true,
                part: "statistics",
              },
            }),
            composio.tools.execute("YOUTUBE_LIST_CHANNEL_VIDEOS", {
              userId: userId,
              connectedAccountId: account.id,
              version,
              dangerouslySkipVersionCheck: skipCheck,
              arguments: {
                channelId: "me", // Requis par l'API - "me" pour le channel de l'utilisateur authentifié
                maxResults: 20, // Augmenté à 20 pour plus de données
                part: "snippet",
              },
            }),
          ]);

          const parallelTime = Date.now() - startTime;
          console.log(
            `[YouTube Metrics] Parallélisation terminée en ${parallelTime}ms`,
          );
          console.log(
            `[YouTube Metrics] Stats status: ${statsResult.status}, Videos status: ${videosResult.status}`,
          );

          const result =
            statsResult.status === "fulfilled" ? statsResult.value : null;

          if (result?.data) {
            console.log(`[YouTube Metrics] Stats récupérées avec succès`);
            // La réponse de YOUTUBE_GET_CHANNEL_STATISTICS a une structure spécifique
            // Elle contient items[0].statistics avec subscriberCount, viewCount, videoCount
            const responseData = result.data as {
              items?: Array<{
                id?: string;
                statistics?: {
                  subscriberCount?: string;
                  viewCount?: string;
                  videoCount?: string;
                };
              }>;
            };

            const statistics = responseData.items?.[0]?.statistics;

            if (statistics) {
              console.log(`[YouTube Metrics] Statistics:`, {
                subscribers: statistics.subscriberCount,
                views: statistics.viewCount,
                videos: statistics.videoCount,
              });
              // Les vidéos sont déjà récupérées en parallèle
              let latestVideos: Array<{
                id: string;
                title: string;
                publishedAt: string;
                viewCount?: number;
                likeCount?: number;
                commentCount?: number;
              }> = [];

              // Initialiser les métriques à 0 par défaut
              let avgViewsPerVideo = 0;
              let engagementRate = 0;
              let totalLikes = 0;
              let totalComments = 0;

              // Utiliser les vidéos déjà récupérées en parallèle
              const videosDataResult =
                videosResult.status === "fulfilled" ? videosResult.value : null;

              try {
                if (videosDataResult?.data) {
                  console.log(`[YouTube Metrics] Videos data récupérée`);

                  // Logger la structure complète pour debug (premiers 1000 caractères)
                  const dataStr = JSON.stringify(
                    videosDataResult.data,
                    null,
                    2,
                  );
                  console.log(
                    `[YouTube Metrics] Videos data structure (preview):`,
                    dataStr.substring(0, 1000),
                  );

                  // La réponse peut avoir différentes structures selon l'endpoint utilisé
                  // playlistItems.list: items[].snippet.resourceId.videoId
                  // search.list: items[].id.videoId (id peut être string ou object)
                  const videosData = videosDataResult.data as {
                    items?: Array<{
                      id?: { videoId?: string } | string; // Structure search.list (id peut être string ou object)
                      snippet?: {
                        resourceId?: { videoId?: string }; // Structure playlistItems.list
                        title?: string;
                        publishedAt?: string;
                      };
                    }>;
                  };

                  console.log(
                    `[YouTube Metrics] Nombre d'items: ${videosData.items?.length ?? 0}`,
                  );

                  // Extraire les videoIds selon la structure (peut être playlistItems ou search)
                  const videoIds =
                    videosData.items
                      ?.map((item, index) => {
                        // Structure playlistItems.list (via uploads playlist) - PRIORITAIRE
                        if (item.snippet?.resourceId?.videoId) {
                          console.log(
                            `[YouTube Metrics] Item ${index}: playlistItems structure - videoId: ${item.snippet.resourceId.videoId}`,
                          );
                          return item.snippet.resourceId.videoId;
                        }
                        // Structure search.list (fallback) - id peut être un objet avec videoId
                        if (typeof item.id === "object" && item.id?.videoId) {
                          console.log(
                            `[YouTube Metrics] Item ${index}: search structure (object) - videoId: ${item.id.videoId}`,
                          );
                          return item.id.videoId;
                        }
                        // Structure search.list - id peut être directement un string (videoId)
                        if (typeof item.id === "string") {
                          console.log(
                            `[YouTube Metrics] Item ${index}: search structure (string) - videoId: ${item.id}`,
                          );
                          return item.id;
                        }
                        console.warn(
                          `[YouTube Metrics] Item ${index}: structure inconnue`,
                          JSON.stringify(item).substring(0, 200),
                        );
                        return null;
                      })
                      .filter((id): id is string => !!id) ?? [];

                  console.log(
                    `[YouTube Metrics] ${videoIds.length} videoIds extraits:`,
                    videoIds.slice(0, 5),
                  );

                  if (videoIds.length > 0) {
                    const detailsStartTime = Date.now();
                    console.log(
                      `[YouTube Metrics] Lancement GET_VIDEO_DETAILS_BATCH pour ${videoIds.length} vidéos`,
                    );

                    // Récupérer les stats détaillées des vidéos (nécessite les videoIds, donc après videos)
                    const videoDetailsResult = await composio.tools.execute(
                      "YOUTUBE_GET_VIDEO_DETAILS_BATCH",
                      {
                        userId: userId,
                        connectedAccountId: account.id,
                        version: toolkitVersion ?? "latest",
                        dangerouslySkipVersionCheck: !toolkitVersion,
                        arguments: {
                          id: videoIds,
                          parts: ["snippet", "statistics"],
                        },
                      },
                    );

                    const detailsTime = Date.now() - detailsStartTime;
                    console.log(
                      `[YouTube Metrics] GET_VIDEO_DETAILS_BATCH terminé en ${detailsTime}ms`,
                    );

                    if (videoDetailsResult?.data) {
                      console.log(
                        `[YouTube Metrics] Video details récupérés avec succès`,
                      );
                      const videoDetails = videoDetailsResult.data as {
                        items?: Array<{
                          id?: string;
                          snippet?: {
                            title?: string;
                            publishedAt?: string;
                          };
                          statistics?: {
                            viewCount?: string;
                            likeCount?: string;
                            commentCount?: string;
                          };
                        }>;
                      };

                      const videosWithStats =
                        videoDetails.items?.map((video) => ({
                          id: video.id ?? "",
                          title: video.snippet?.title ?? "Sans titre",
                          publishedAt: video.snippet?.publishedAt ?? "",
                          viewCount: parseInt(
                            video.statistics?.viewCount ?? "0",
                            10,
                          ),
                          likeCount: parseInt(
                            video.statistics?.likeCount ?? "0",
                            10,
                          ),
                          commentCount: parseInt(
                            video.statistics?.commentCount ?? "0",
                            10,
                          ),
                        })) ?? [];

                      // Calculer des métriques pertinentes
                      const totalViews = videosWithStats.reduce(
                        (sum, v) => sum + v.viewCount,
                        0,
                      );
                      totalLikes = videosWithStats.reduce(
                        (sum, v) => sum + v.likeCount,
                        0,
                      );
                      totalComments = videosWithStats.reduce(
                        (sum, v) => sum + v.commentCount,
                        0,
                      );
                      avgViewsPerVideo =
                        videosWithStats.length > 0
                          ? Math.round(totalViews / videosWithStats.length)
                          : 0;
                      engagementRate =
                        totalViews > 0
                          ? ((totalLikes + totalComments) / totalViews) * 100
                          : 0;

                      // Garder les 10 dernières pour l'affichage (plus de données = meilleures métriques)
                      latestVideos = videosWithStats.slice(0, 10);

                      console.log(`[YouTube Metrics] Métriques calculées:`, {
                        totalVideos: videosWithStats.length,
                        avgViewsPerVideo,
                        totalLikes,
                        totalComments,
                        engagementRate: Math.round(engagementRate * 100) / 100,
                        latestVideosCount: latestVideos.length,
                      });
                    } else {
                      console.warn(
                        `[YouTube Metrics] videoDetailsResult.data est null/undefined`,
                      );
                    }
                  } else {
                    console.warn(`[YouTube Metrics] Aucun videoId trouvé`);
                  }
                } else {
                  console.warn(
                    `[YouTube Metrics] videosDataResult.data est null/undefined`,
                  );
                }
              } catch (videosError) {
                console.error(
                  "[YouTube Metrics] Erreur lors de la récupération des vidéos:",
                  videosError,
                );
                // Continuer même si la récupération des vidéos échoue
              }

              const totalTime = Date.now() - startTime;
              console.log(
                `[YouTube Metrics] Retour des métriques (total: ${totalTime}ms):`,
                {
                  subscribers: parseInt(statistics.subscriberCount ?? "0", 10),
                  views: parseInt(statistics.viewCount ?? "0", 10),
                  videos: parseInt(statistics.videoCount ?? "0", 10),
                  avgViewsPerVideo,
                  totalLikes,
                  totalComments,
                  latestVideosCount: latestVideos.length,
                },
              );

              // TOUJOURS retourner avec toutes les métriques (même si 0)
              return {
                status: "connected",
                subscribers: parseInt(statistics.subscriberCount ?? "0", 10),
                views: parseInt(statistics.viewCount ?? "0", 10),
                videos: parseInt(statistics.videoCount ?? "0", 10),
                latestVideos,
                // Métriques calculées (toujours présentes, même si 0)
                avgViewsPerVideo,
                engagementRate: Math.round(engagementRate * 100) / 100, // 2 décimales
                totalLikes,
                totalComments,
              };
            }
          }
        } catch (actionError) {
          console.error(
            "Erreur lors de l'exécution de l'action YouTube:",
            actionError,
          );
          // En cas d'erreur, retourner quand même le statut connecté
        }

        return {
          status: "connected",
          subscribers: 0,
          views: 0,
          videos: 0,
        };
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des métriques YouTube:",
          error,
        );
        return null;
      }
    }),

  /**
   * Récupérer les métriques Instagram d'une intégration connectée
   */
  getInstagramMetrics: protectedProcedure
    .input(
      z.object({
        integrationKey: z.string().min(1, "La clé d'intégration est requise"),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const composio = getComposioClient();
        const userId = ctx.session.user.id;
        const toolkitSlug = input.integrationKey;
        const normalizedSlug = normalizeSlug(toolkitSlug);

        if (normalizedSlug !== "instagram") {
          return null;
        }

        // Paralléliser la récupération du compte et du toolkit
        const results = await Promise.all([
          getCachedConnectedAccounts(composio, userId),
          getCachedToolkit(composio, "instagram"),
        ]);
        const connectedAccounts = results[0];
        const instagramToolkit = results[1];

        const account = connectedAccounts.find((acc) => {
          const accountSlug = acc.toolkit?.slug ?? "";
          return (
            normalizeSlug(accountSlug) === normalizedSlug &&
            acc.status === "ACTIVE"
          );
        });

        if (!account) {
          return null;
        }

        const toolkitVersion = (
          instagramToolkit as { meta?: { availableVersions?: string[] } }
        )?.meta?.availableVersions?.[0];

        console.log(
          `[Instagram Metrics] Début - userId: ${userId}, accountId: ${account.id}, version: ${toolkitVersion ?? "latest"}`,
        );

        try {
          // OPTIMISATION ULTRA: Paralléliser userInfo, insights ET media dès le début
          // On peut utiliser "me" pour insights/media même sans avoir l'ID utilisateur
          const version = toolkitVersion ?? "latest";
          const skipCheck = !toolkitVersion;

          const startTime = Date.now();
          console.log(
            `[Instagram Metrics] Lancement parallèle: GET_USER_INFO + GET_USER_INSIGHTS + GET_USER_MEDIA`,
          );

          const [userInfoResult, insightsResult, mediaResult] =
            await Promise.allSettled([
              composio.tools.execute("INSTAGRAM_GET_USER_INFO", {
                userId: userId,
                connectedAccountId: account.id,
                version,
                dangerouslySkipVersionCheck: skipCheck,
                arguments: {
                  ig_user_id: "me",
                },
              }),
              // Pré-lancer insights avec "me" (on pourra utiliser l'ID plus tard si besoin)
              composio.tools.execute("INSTAGRAM_GET_USER_INSIGHTS", {
                userId: userId,
                connectedAccountId: account.id,
                version,
                dangerouslySkipVersionCheck: skipCheck,
                arguments: {
                  ig_user_id: "me", // Utiliser "me" directement
                  metric: ["reach", "likes", "comments"],
                  period: "days_28",
                  metric_type: "total_value",
                },
              }),
              // Pré-lancer media avec "me"
              composio.tools.execute("INSTAGRAM_GET_USER_MEDIA", {
                userId: userId,
                connectedAccountId: account.id,
                version,
                dangerouslySkipVersionCheck: skipCheck,
                arguments: {
                  ig_user_id: "me", // Utiliser "me" directement
                  limit: 20, // Augmenté à 20 pour plus de données
                },
              }),
            ]);

          const parallelTime = Date.now() - startTime;
          console.log(
            `[Instagram Metrics] Parallélisation terminée en ${parallelTime}ms`,
          );
          console.log(
            `[Instagram Metrics] UserInfo status: ${userInfoResult.status}, Insights status: ${insightsResult.status}, Media status: ${mediaResult.status}`,
          );

          // Traiter userInfo
          const userInfoData =
            userInfoResult.status === "fulfilled" ? userInfoResult.value : null;
          if (!userInfoData?.data) {
            console.error(
              "[Instagram Metrics] Pas de données dans userInfoResult",
            );
            return null;
          }

          console.log(`[Instagram Metrics] UserInfo récupéré avec succès`);

          const responseData = userInfoData.data as
            | {
                followers_count?: number;
                media_count?: number;
                username?: string;
                id?: string;
              }
            | {
                data?: {
                  followers_count?: number;
                  media_count?: number;
                  username?: string;
                  id?: string;
                };
              };

          const userInfo =
            "data" in responseData && responseData.data
              ? responseData.data
              : (responseData as {
                  followers_count?: number;
                  media_count?: number;
                  username?: string;
                  id?: string;
                });

          // Récupérer les insights et media (déjà en parallèle)
          let reach = 0;
          let engagementRate = 0;
          let totalLikes = 0;
          let totalComments = 0;

          const latestPosts: Array<{
            id: string;
            caption?: string;
            likeCount?: number;
            commentCount?: number;
            mediaType?: string;
          }> = [];

          try {
            // Traiter insights (déjà récupéré en parallèle)
            const insightsData =
              insightsResult.status === "fulfilled"
                ? insightsResult.value
                : null;
            console.log(
              `[Instagram Metrics] Insights data status: ${insightsData ? "présent" : "absent"}`,
            );

            if (insightsData?.data) {
              const insights = insightsData.data as {
                data?: Array<{
                  name?: string;
                  values?: Array<{
                    value?: number;
                  }>;
                }>;
              };

              insights.data?.forEach((metric) => {
                const value = metric.values?.[0]?.value ?? 0;
                if (metric.name === "reach") {
                  reach = value;
                } else if (metric.name === "likes") {
                  totalLikes = value;
                } else if (metric.name === "comments") {
                  totalComments = value;
                }
              });

              // Calculer le taux d'engagement
              if (reach > 0) {
                engagementRate = ((totalLikes + totalComments) / reach) * 100;
              }

              console.log(`[Instagram Metrics] Insights calculés:`, {
                reach,
                totalLikes,
                totalComments,
                engagementRate: Math.round(engagementRate * 100) / 100,
              });
            }

            // Traiter media (déjà récupéré en parallèle)
            const mediaDataResult =
              mediaResult.status === "fulfilled" ? mediaResult.value : null;

            console.log(
              `[Instagram Metrics] Media data status: ${mediaDataResult?.data ? "présent" : "absent"}`,
            );

            if (mediaDataResult?.data) {
              const mediaData = mediaDataResult.data as {
                data?: Array<{
                  id?: string;
                  caption?: string;
                  like_count?: number;
                  comments_count?: number;
                  media_type?: string;
                }>;
              };

              const mediaItems = mediaData.data ?? [];
              console.log(
                `[Instagram Metrics] ${mediaItems.length} posts récupérés`,
              );

              // OPTIMISATION ULTRA: Paralléliser TOUS les postInsights (20 posts en parallèle)
              const postsToAnalyze = mediaItems.slice(0, 20); // Analyser 20 posts pour plus de données
              console.log(
                `[Instagram Metrics] Analyse de ${postsToAnalyze.length} posts en parallèle`,
              );

              const postInsightsStartTime = Date.now();
              const postInsightsPromises = postsToAnalyze
                .filter((media) => media.id)
                .map((media) =>
                  composio.tools.execute("INSTAGRAM_GET_POST_INSIGHTS", {
                    userId: userId,
                    connectedAccountId: account.id,
                    version,
                    dangerouslySkipVersionCheck: skipCheck,
                    arguments: {
                      ig_post_id: media.id!,
                      metric_preset: "auto_safe",
                    },
                  }),
                );

              // Utiliser allSettled pour ne pas bloquer sur une erreur
              const postInsightsResults =
                await Promise.allSettled(postInsightsPromises);

              const postInsightsTime = Date.now() - postInsightsStartTime;
              console.log(
                `[Instagram Metrics] ${postInsightsResults.length} postInsights récupérés en ${postInsightsTime}ms`,
              );

              // Traiter les résultats en parallèle
              for (let i = 0; i < postsToAnalyze.length; i++) {
                const media = mediaItems[i];
                if (!media?.id) continue;

                const postInsightsResult = postInsightsResults[i];
                if (postInsightsResult?.status !== "fulfilled") {
                  // Fallback sur les données de base en cas d'erreur
                  latestPosts.push({
                    id: media.id,
                    caption: media.caption?.substring(0, 100) ?? "",
                    likeCount: media.like_count ?? 0,
                    commentCount: media.comments_count ?? 0,
                    mediaType: media.media_type,
                  });
                  continue;
                }

                const postInsights = postInsightsResult.value as {
                  data?: unknown;
                } | null;

                if (postInsights?.data) {
                  const insights = postInsights.data as {
                    data?: Array<{
                      name?: string;
                      values?: Array<{
                        value?: number;
                      }>;
                    }>;
                  };

                  let likes = media.like_count ?? 0;
                  let comments = media.comments_count ?? 0;

                  insights.data?.forEach((metric) => {
                    const value = metric.values?.[0]?.value ?? 0;
                    if (metric.name === "likes") {
                      likes = value;
                    } else if (metric.name === "comments") {
                      comments = value;
                    }
                  });

                  latestPosts.push({
                    id: media.id,
                    caption: media.caption?.substring(0, 100) ?? "",
                    likeCount: likes,
                    commentCount: comments,
                    mediaType: media.media_type,
                  });
                } else {
                  // Fallback sur les données de base
                  latestPosts.push({
                    id: media.id,
                    caption: media.caption?.substring(0, 100) ?? "",
                    likeCount: media.like_count ?? 0,
                    commentCount: media.comments_count ?? 0,
                    mediaType: media.media_type,
                  });
                }
              }
            }
          } catch (mediaError) {
            console.error(
              "Erreur lors de la récupération des posts:",
              mediaError,
            );
            // Continuer même si la récupération des posts échoue
          }

          // Calculer la moyenne de likes par post
          const avgLikesPerPost =
            latestPosts.length > 0
              ? Math.round(
                  latestPosts.reduce((sum, p) => sum + (p.likeCount ?? 0), 0) /
                    latestPosts.length,
                )
              : 0;

          const totalTime = Date.now() - startTime;
          console.log(
            `[Instagram Metrics] Retour des métriques (total: ${totalTime}ms):`,
            {
              followers: userInfo.followers_count ?? 0,
              posts: userInfo.media_count ?? 0,
              reach,
              engagementRate: Math.round(engagementRate * 100) / 100,
              totalLikes,
              totalComments,
              avgLikesPerPost,
              latestPostsCount: latestPosts.length,
            },
          );

          return {
            status: "connected",
            followers: userInfo.followers_count ?? 0,
            posts: userInfo.media_count ?? 0,
            username: userInfo.username,
            reach,
            engagementRate: Math.round(engagementRate * 100) / 100,
            totalLikes,
            totalComments,
            avgLikesPerPost,
            latestPosts: latestPosts.slice(0, 10), // Garder 10 posts pour l'affichage
          };
        } catch (actionError) {
          console.error(
            "Erreur lors de l'exécution de l'action Instagram:",
            actionError,
          );
          // Retourner un objet avec status pour éviter les erreurs
          return {
            status: "error" as const,
            followers: 0,
            posts: 0,
            reach: 0,
            engagementRate: 0,
            totalLikes: 0,
            totalComments: 0,
            avgLikesPerPost: 0,
            latestPosts: [],
          };
        }
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des métriques Instagram:",
          error,
        );
        // Retourner un objet avec status pour éviter les erreurs
        return {
          status: "error" as const,
          followers: 0,
          posts: 0,
          reach: 0,
          engagementRate: 0,
          totalLikes: 0,
          totalComments: 0,
          avgLikesPerPost: 0,
          latestPosts: [],
        };
      }
    }),

  /**
   * Récupérer les métriques d'une intégration connectée (générique)
   */
  getMetrics: protectedProcedure
    .input(
      z.object({
        integrationKey: z.string().min(1, "La clé d'intégration est requise"),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const composio = getComposioClient();
        const userId = ctx.session.user.id;
        const toolkitSlug = input.integrationKey;
        const normalizedSlug = normalizeSlug(toolkitSlug);

        // Pour YouTube, utiliser la route spécifique
        if (normalizedSlug === "youtube") {
          // Appeler la route YouTube spécifique
          // Pour l'instant, on retourne null et on laisse le frontend gérer
          return null;
        }

        // Pour les autres intégrations, retourner juste le statut
        const connectedAccounts = await composio.connectedAccounts.list({
          userIds: [userId],
        });

        const account = connectedAccounts.items.find((acc) => {
          const accountSlug = acc.toolkit?.slug ?? "";
          return (
            normalizeSlug(accountSlug) === normalizedSlug &&
            acc.status === "ACTIVE"
          );
        });

        if (!account) {
          return null;
        }

        return {
          status: "connected",
        };
      } catch (error) {
        console.error("Erreur lors de la récupération des métriques:", error);
        return null;
      }
    }),

  /**
   * Finaliser l'onboarding des intégrations
   */
  completeOnboarding: protectedProcedure.mutation(async ({ ctx: _ctx }) => {
    // Marquer que l'onboarding des intégrations est complété
    // Vous pouvez ajouter un champ `integrationsOnboardingCompleted` dans le User model si besoin
    // Pour l'instant, on considère que c'est complété une fois cette route appelée
    // ctx.session.user.id est disponible si besoin pour une utilisation future

    return {
      success: true as const,
    };
  }),
});
