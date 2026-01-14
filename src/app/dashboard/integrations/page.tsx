"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  RefreshCw,
  Unlink,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { AnimatedCard } from "~/components/ui/animated-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "~/trpc/react";
import { getIntegrationIcon } from "~/app/onboarding/integrations/integration-icons";
import { cn } from "~/lib/utils";

const ITEMS_PER_PAGE = 12;

export default function IntegrationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: integrations, isLoading: isLoadingIntegrations } =
    api.integrations.list.useQuery();
  const { data: connectedIntegrations } =
    api.integrations.getConnected.useQuery();

  // Normaliser les slugs pour la comparaison
  const normalizeSlug = (slug: string) => slug.toLowerCase().replace(/-/g, "");

  // Séparer les intégrations connectées et non connectées
  const { connected, notConnected } = useMemo(() => {
    if (!integrations) return { connected: [], notConnected: [] };

    const connectedSlugs = new Set(
      (connectedIntegrations ?? []).map(normalizeSlug),
    );

    const connected: typeof integrations = [];
    const notConnected: typeof integrations = [];

    integrations.forEach((integration) => {
      const normalizedSlug = normalizeSlug(integration.slug);
      if (connectedSlugs.has(normalizedSlug)) {
        connected.push(integration);
      } else {
        notConnected.push(integration);
      }
    });

    return { connected, notConnected };
  }, [integrations, connectedIntegrations]);

  // Filtrer selon la recherche
  const filteredConnected = useMemo(() => {
    if (!searchQuery.trim()) return connected;
    const query = searchQuery.toLowerCase();
    return connected.filter(
      (integration) =>
        (integration.name?.toLowerCase().includes(query) ?? false) ||
        integration.slug.toLowerCase().includes(query),
    );
  }, [connected, searchQuery]);

  const filteredNotConnected = useMemo(() => {
    if (!searchQuery.trim()) return notConnected;
    const query = searchQuery.toLowerCase();
    return notConnected.filter(
      (integration) =>
        (integration.name?.toLowerCase().includes(query) ?? false) ||
        integration.slug.toLowerCase().includes(query),
    );
  }, [notConnected, searchQuery]);

  // Pagination pour les intégrations non connectées
  const totalPages = Math.ceil(filteredNotConnected.length / ITEMS_PER_PAGE);
  const paginatedNotConnected = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredNotConnected.slice(startIndex, endIndex);
  }, [filteredNotConnected, currentPage]);

  // Réinitialiser la page quand la recherche change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const utils = api.useUtils();

  const connectIntegration = api.integrations.connect.useMutation({
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.assign(data.authUrl);
      } else {
        // Rafraîchir les données après connexion
        void utils.integrations.getConnected.invalidate();
      }
    },
  });

  const disconnectIntegration = api.integrations.disconnect.useMutation({
    onSuccess: () => {
      // Rafraîchir les données après déconnexion
      void utils.integrations.getConnected.invalidate();
    },
  });

  const handleConnect = (integrationSlug: string) => {
    connectIntegration.mutate({
      integrationKey: integrationSlug,
      returnTo: "/dashboard/integrations",
    });
  };

  const handleReconnect = (integrationSlug: string) => {
    // Déconnecter d'abord, puis reconnecter
    disconnectIntegration.mutate(
      { integrationKey: integrationSlug },
      {
        onSuccess: () => {
          // Attendre un peu avant de reconnecter pour laisser le temps à la déconnexion
          setTimeout(() => {
            connectIntegration.mutate({ integrationKey: integrationSlug });
          }, 500);
        },
      },
    );
  };

  const handleDisconnect = (
    integrationSlug: string,
    integrationName: string,
  ) => {
    if (
      confirm(`Êtes-vous sûr de vouloir déconnecter "${integrationName}" ?`)
    ) {
      disconnectIntegration.mutate({ integrationKey: integrationSlug });
    }
  };

  if (isLoadingIntegrations) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="border-primary mx-auto size-8 animate-spin rounded-full border-4 border-t-transparent" />
            <p className="text-muted-foreground mt-4">Chargement...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Intégrations</h1>
        <p className="text-muted-foreground mt-2">
          Gérez vos intégrations connectées et découvrez de nouvelles
          possibilités
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Rechercher une intégration..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Connected Integrations */}
      {filteredConnected.length > 0 && (
        <div className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Intégrations actives ({filteredConnected.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredConnected.map((integration) => {
              const Icon = getIntegrationIcon(integration.slug);
              const isDisconnecting =
                disconnectIntegration.isPending &&
                disconnectIntegration.variables?.integrationKey ===
                  integration.slug;
              const isReconnecting =
                connectIntegration.isPending &&
                connectIntegration.variables?.integrationKey ===
                  integration.slug;

              return (
                <div key={integration.slug} className="group relative">
                  <AnimatedCard className="h-full transition-all duration-300">
                    <Link
                      href={`/dashboard/integrations/${integration.slug}`}
                      className="block h-full"
                    >
                      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                        <div className="bg-muted mb-3 flex size-12 items-center justify-center rounded-lg">
                          {integration.logo ? (
                            <img
                              src={integration.logo}
                              alt={integration.name}
                              className="size-7 object-contain"
                            />
                          ) : (
                            <Icon className="size-7" />
                          )}
                        </div>
                        <h3 className="mb-1 text-sm font-medium">
                          {integration.name}
                        </h3>
                        <p className="text-muted-foreground text-xs">
                          Connecté
                        </p>
                        <div className="mt-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <ArrowUpRight className="text-muted-foreground size-4" />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                <MoreVertical className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReconnect(integration.slug);
                                }}
                                disabled={isReconnecting || isDisconnecting}
                              >
                                <RefreshCw className="mr-2 size-4" />
                                {isReconnecting
                                  ? "Reconnexion..."
                                  : "Reconnecter"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDisconnect(
                                    integration.slug,
                                    integration.name ?? "",
                                  );
                                }}
                                disabled={isDisconnecting || isReconnecting}
                                className="text-destructive focus:text-destructive"
                              >
                                <Unlink className="mr-2 size-4" />
                                {isDisconnecting
                                  ? "Déconnexion..."
                                  : "Déconnecter"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </Link>
                  </AnimatedCard>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Integrations Section */}
      {showAll && (
        <div className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Toutes les intégrations ({filteredNotConnected.length})
            </h2>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {paginatedNotConnected.map((integration) => {
              const Icon = getIntegrationIcon(integration.slug);
              const isConnecting =
                connectIntegration.isPending &&
                connectIntegration.variables?.integrationKey ===
                  integration.slug;

              return (
                <AnimatedCard
                  key={integration.slug}
                  className={cn(
                    "group relative w-[calc(50%-0.5rem)] cursor-pointer transition-all duration-300 sm:w-[calc(33.333%-0.67rem)] lg:w-[calc(20%-0.8rem)]",
                    isConnecting && "opacity-50",
                  )}
                  onClick={() => handleConnect(integration.slug)}
                >
                  <div className="flex flex-col items-center p-6 text-center">
                    <div className="bg-muted mb-3 flex size-12 items-center justify-center rounded-lg">
                      {integration.logo ? (
                        <img
                          src={integration.logo}
                          alt={integration.name}
                          className="size-7 object-contain"
                        />
                      ) : (
                        <Icon className="size-7" />
                      )}
                    </div>
                    <h3 className="mb-1 text-sm font-medium">
                      {integration.name}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={isConnecting}
                    >
                      {isConnecting ? "Connexion..." : "Connecter"}
                    </Button>
                  </div>
                </AnimatedCard>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="gap-2"
              >
                <ChevronLeft className="size-4" />
                Précédent
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {currentPage} sur {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className="gap-2"
              >
                Suivant
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Toggle Show All */}
      {!showAll && filteredNotConnected.length > 0 && (
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => {
              setShowAll(true);
              setCurrentPage(1);
            }}
            className="gap-2"
          >
            <Plus className="size-4" />
            Voir toutes les intégrations ({filteredNotConnected.length})
          </Button>
        </div>
      )}

      {/* Empty State */}
      {filteredConnected.length === 0 && filteredNotConnected.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">
            {searchQuery
              ? "Aucune intégration ne correspond à votre recherche"
              : "Aucune intégration disponible"}
          </p>
        </div>
      )}
    </div>
  );
}
