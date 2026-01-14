"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ArrowLeft,
  Link2,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { ShimmerButton } from "~/components/ui/shimmer-button";
import { BlurFade } from "~/components/ui/blur-fade";
import { AnimatedCard } from "~/components/ui/animated-card";
import { Particles } from "~/components/ui/particles";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";
import { getIntegrationIcon } from "./integration-icons";

const ITEMS_PER_PAGE = 12;

export default function IntegrationsOnboardingPage() {
  const router = useRouter();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: status, isLoading } = api.onboarding.getStatus.useQuery();
  const { data: integrations, isLoading: isLoadingIntegrations } =
    api.integrations.list.useQuery();
  const { data: connectedIntegrations } =
    api.integrations.getConnected.useQuery();

  // Filtrer les intégrations selon la recherche
  const filteredIntegrations = useMemo(() => {
    if (!integrations) return [];
    if (!searchQuery.trim()) {
      return integrations;
    }
    const query = searchQuery.toLowerCase();
    return integrations.filter(
      (integration) =>
        (integration.name?.toLowerCase().includes(query) ?? false) ||
        integration.slug.toLowerCase().includes(query),
    );
  }, [integrations, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredIntegrations.length / ITEMS_PER_PAGE);
  const paginatedIntegrations = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredIntegrations.slice(startIndex, endIndex);
  }, [filteredIntegrations, currentPage]);

  // Réinitialiser la page quand la recherche change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const connectIntegration = api.integrations.connect.useMutation({
    onSuccess: (data) => {
      console.log("✅ Connexion réussie:", data);
      if (data.authUrl) {
        // Rediriger vers la page d'autorisation Composio
        console.log("🔗 Redirection vers:", data.authUrl);
        // Utiliser window.location.assign pour forcer la redirection
        window.location.assign(data.authUrl);
      } else {
        // Intégration connectée directement
        console.log("ℹ️ Intégration déjà connectée");
        setConnecting(null);
        router.refresh();
      }
    },
    onError: (error) => {
      console.error("❌ Erreur lors de la connexion:", error);
      console.error("Détails:", error.data, error.message);
      setConnecting(null);
      // Afficher une notification d'erreur
      alert(
        `Erreur: ${error.message ?? "Impossible de connecter l'intégration"}`,
      );
    },
  });

  const handleConnect = async (integrationSlug: string) => {
    console.log("Tentative de connexion pour:", integrationSlug);
    setConnecting(integrationSlug);
    connectIntegration.mutate({ integrationKey: integrationSlug });
  };

  const completeIntegrations = api.integrations.completeOnboarding.useMutation({
    onSuccess: () => {
      router.push("/dashboard");
      router.refresh();
    },
  });

  // Rediriger si onboarding principal pas complété
  useEffect(() => {
    if (!isLoading && !status?.completed) {
      router.push("/onboarding");
    }
  }, [status, isLoading, router]);

  const handleSkip = () => {
    completeIntegrations.mutate();
  };

  const handleComplete = () => {
    completeIntegrations.mutate();
  };

  if (isLoading || isLoadingIntegrations) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="border-primary mx-auto size-8 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="text-muted-foreground mt-4">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!status?.completed) {
    return null;
  }

  return (
    <div className="bg-background relative min-h-screen">
      {/* Particles Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <Particles className="absolute inset-0" quantity={50} />
      </div>

      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Button */}
        <BlurFade delay={0.05}>
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push("/onboarding")}
              className="gap-2"
            >
              <ArrowLeft className="size-4" />
              Retour
            </Button>
          </div>
        </BlurFade>

        {/* Header */}
        <BlurFade delay={0.1}>
          <div className="mb-8 text-center">
            <div className="bg-primary/10 mx-auto flex size-20 items-center justify-center rounded-full">
              <Link2 className="text-primary size-10" />
            </div>
            <h1 className="mt-6 text-3xl font-bold sm:text-4xl">
              Connectez vos outils
            </h1>
            <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
              InVision analysera les données de ces plateformes pour mieux
              comprendre votre business et vous donner des conseils
              personnalisés
            </p>
            <p className="text-muted-foreground mx-auto mt-2 max-w-2xl text-sm">
              Vous pourrez les connecter plus tard depuis votre dashboard si
              besoin
            </p>
          </div>
        </BlurFade>

        {/* Search Bar */}
        <BlurFade delay={0.15}>
          <div className="mx-auto mb-6 max-w-md">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Rechercher une intégration..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {searchQuery && (
              <p className="text-muted-foreground mt-2 text-center text-sm">
                {filteredIntegrations.length} intégration
                {filteredIntegrations.length > 1 ? "s" : ""} trouvée
                {filteredIntegrations.length > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </BlurFade>

        {/* Integrations Grid */}
        <BlurFade delay={0.2}>
          <div className="mx-auto max-w-6xl">
            {paginatedIntegrations.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">
                  Aucune intégration trouvée pour &quot;{searchQuery}&quot;
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap justify-center gap-4">
                  {paginatedIntegrations.map((integration) => {
                    const Icon = getIntegrationIcon(integration.slug);
                    // Normaliser les slugs pour la comparaison
                    const normalizeSlug = (slug: string) =>
                      slug.toLowerCase().replace(/-/g, "");
                    const normalizedIntegrationSlug = normalizeSlug(
                      integration.slug,
                    );
                    const isConnected =
                      connectedIntegrations?.some(
                        (connectedSlug) =>
                          normalizeSlug(connectedSlug) ===
                          normalizedIntegrationSlug,
                      ) ?? false;
                    const isConnecting = connecting === integration.slug;

                    return (
                      <AnimatedCard
                        key={integration.slug}
                        className={`group relative w-[calc(50%-0.5rem)] cursor-pointer transition-all duration-300 hover:scale-105 sm:w-[calc(33.333%-0.67rem)] md:w-[calc(25%-0.75rem)] lg:w-[calc(20%-0.8rem)] xl:w-[calc(16.666%-0.83rem)] ${
                          isConnected ? "border-primary bg-primary/5" : ""
                        } ${isConnecting ? "cursor-wait opacity-50" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!isConnected && !isConnecting) {
                            void handleConnect(integration.slug);
                          }
                        }}
                      >
                        <div className="flex flex-col items-center gap-3 p-4 sm:p-6">
                          <div
                            className={`flex size-12 items-center justify-center rounded-2xl transition-all sm:size-14 ${
                              isConnected
                                ? "bg-primary/20"
                                : "bg-muted group-hover:bg-primary/10"
                            }`}
                          >
                            {integration.logo ? (
                              <img
                                src={integration.logo}
                                alt={integration.name}
                                className={`size-6 transition-opacity sm:size-8 ${
                                  isConnected
                                    ? "opacity-100"
                                    : "opacity-60 group-hover:opacity-100"
                                }`}
                              />
                            ) : (
                              <Icon
                                className={`size-6 transition-opacity sm:size-8 ${
                                  isConnected
                                    ? "opacity-100"
                                    : "opacity-60 group-hover:opacity-100"
                                }`}
                              />
                            )}
                          </div>
                          <span className="text-center text-xs leading-tight font-medium sm:text-sm">
                            {integration.name}
                          </span>
                          {isConnected && (
                            <div className="text-primary flex items-center gap-1.5 text-xs">
                              <CheckCircle2 className="size-3.5 sm:size-4" />
                              <span>Connecté</span>
                            </div>
                          )}
                          {isConnecting && (
                            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                              <div className="border-primary size-3.5 animate-spin rounded-full border-2 border-t-transparent sm:size-4" />
                              <span>Connexion...</span>
                            </div>
                          )}
                        </div>
                      </AnimatedCard>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          // Afficher la première, dernière, et les pages autour de la page actuelle
                          return (
                            page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 1 && page <= currentPage + 1)
                          );
                        })
                        .map((page, index, array) => {
                          // Ajouter des ellipses si nécessaire
                          const showEllipsisBefore =
                            index > 0 &&
                            array[index - 1] !== undefined &&
                            page - array[index - 1]! > 1;
                          return (
                            <div key={page} className="flex items-center gap-1">
                              {showEllipsisBefore && (
                                <span className="text-muted-foreground px-2">
                                  ...
                                </span>
                              )}
                              <Button
                                variant={
                                  currentPage === page ? "default" : "outline"
                                }
                                size="sm"
                                onClick={() => setCurrentPage(page)}
                                className="min-w-[2.5rem]"
                              >
                                {page}
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </BlurFade>

        {/* CTA Buttons */}
        <BlurFade delay={0.3}>
          <div className="mx-auto mt-12 flex max-w-md flex-col gap-4 sm:flex-row sm:justify-center">
            <Button
              variant="outline"
              onClick={handleSkip}
              className="w-full sm:w-auto"
              disabled={connecting !== null}
            >
              Passer cette étape
            </Button>
            <ShimmerButton
              onClick={handleComplete}
              className="w-full sm:w-auto"
              disabled={connecting !== null}
            >
              Continuer vers le dashboard
            </ShimmerButton>
          </div>
        </BlurFade>
      </div>
    </div>
  );
}
