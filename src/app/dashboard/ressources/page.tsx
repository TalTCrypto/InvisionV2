"use client";

import { useState, useMemo, useEffect } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  Edit,
  Eye,
  Loader2,
  AlertCircle,
  Search,
  RefreshCw,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { AnimatedCard } from "~/components/ui/animated-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { api } from "~/trpc/react";
import { BlurFade } from "~/components/ui/blur-fade";

const STATUS_COLORS = {
  pending: "bg-gray-500",
  processing: "bg-orange-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
} as const;

const STATUS_LABELS = {
  pending: "En attente",
  processing: "Traitement...",
  completed: "Prêt",
  failed: "Échec",
} as const;

// Secure metadata parser with validation
function parseResourceMetadata(metadata: string | null): {
  charCount: number;
  wordCount: number;
} {
  const defaultMetadata = { charCount: 0, wordCount: 0 };

  if (!metadata) return defaultMetadata;

  try {
    const parsed: unknown = JSON.parse(metadata);

    // Validate structure
    if (typeof parsed !== "object" || parsed === null) {
      console.error("[Resources] Invalid metadata: not an object");
      return defaultMetadata;
    }

    // Type guard for metadata object
    const isValidMetadata = (obj: object): obj is Record<string, unknown> => {
      return true;
    };

    if (!isValidMetadata(parsed)) {
      return defaultMetadata;
    }

    return {
      charCount: typeof parsed.charCount === "number" ? parsed.charCount : 0,
      wordCount: typeof parsed.wordCount === "number" ? parsed.wordCount : 0,
    };
  } catch (error) {
    console.error("[Resources] Failed to parse metadata:", error);
    return defaultMetadata;
  }
}

export default function RessourcesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    undefined,
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    category: "",
    content: "",
  });

  const utils = api.useUtils();

  const { data: resources, isLoading } = api.resources.list.useQuery({
    category: selectedCategory,
  });

  const { data: searchResults, isLoading: isSearching } =
    api.resources.search.useQuery(
      { query: searchQuery },
      { enabled: searchQuery.length > 0 },
    );

  useEffect(() => {
    const hasProcessing = resources?.some(
      (r) =>
        r.processingStatus === "pending" || r.processingStatus === "processing",
    );

    if (!hasProcessing) return;

    const interval = setInterval(() => {
      void utils.resources.list.invalidate();
    }, 5000);

    return () => clearInterval(interval);
  }, [resources, utils.resources.list]);

  const { data: categories } = api.resources.getCategories.useQuery();

  const { data: currentResource } = api.resources.getById.useQuery(
    { id: selectedResource ?? "" },
    { enabled: !!selectedResource },
  );

  const createMutation = api.resources.create.useMutation({
    onSuccess: () => {
      void utils.resources.list.invalidate();
      void utils.resources.getCategories.invalidate();
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = api.resources.update.useMutation({
    onSuccess: () => {
      void utils.resources.list.invalidate();
      void utils.resources.getById.invalidate();
      setEditDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = api.resources.delete.useMutation({
    onSuccess: () => {
      void utils.resources.list.invalidate();
      void utils.resources.getCategories.invalidate();
      setDeleteDialogOpen(false);
      setSelectedResource(null);
    },
  });

  const processResourceMutation = api.resources.processResource.useMutation({
    onSuccess: () => {
      void utils.resources.list.invalidate();
    },
  });

  const resetForm = () => {
    setFormData({ title: "", category: "", content: "" });
    setSelectedResource(null);
  };

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedResource) return;
    updateMutation.mutate({
      id: selectedResource,
      ...formData,
    });
  };

  const handleDelete = () => {
    if (!selectedResource) return;
    deleteMutation.mutate({ id: selectedResource });
  };

  const openEditDialog = (resource: NonNullable<typeof resources>[0]) => {
    setSelectedResource(resource.id);
    setFormData({
      title: resource.title,
      category: resource.category ?? "",
      content: resource.content,
    });
    setEditDialogOpen(true);
  };

  const openViewDialog = (resourceId: string) => {
    setSelectedResource(resourceId);
    setViewDialogOpen(true);
  };

  const openDeleteDialog = (resourceId: string) => {
    setSelectedResource(resourceId);
    setDeleteDialogOpen(true);
  };

  const filteredResources = useMemo(() => {
    if (!resources) return [];
    return resources;
  }, [resources]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="border-primary mx-auto size-8 animate-spin" />
            <p className="text-muted-foreground mt-4">Chargement...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <BlurFade delay={0.1}>
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Ressources</h1>
              <p className="text-muted-foreground mt-2">
                Gérez vos ressources business avec traitement intelligent
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowSearch(!showSearch)}
              >
                <Search className="size-4" />
              </Button>
              <Button
                onClick={() => {
                  resetForm();
                  setCreateDialogOpen(true);
                }}
              >
                <Plus className="mr-2 size-4" />
                Ajouter une ressource
              </Button>
            </div>
          </div>

          {showSearch && (
            <div className="mt-4">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Recherche sémantique..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {searchQuery && searchResults && searchResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  {searchResults.map((result) => (
                    <AnimatedCard key={result.resourceId} className="p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="font-medium">{result.title}</h4>
                        {result.category && (
                          <Badge variant="secondary">{result.category}</Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        {result.matches.map((match, idx) => (
                          <div
                            key={idx}
                            className="bg-muted/30 rounded border p-2 text-sm"
                          >
                            <p className="text-muted-foreground mb-1 text-xs">
                              Similarité: {(match.similarity * 100).toFixed(1)}%
                            </p>
                            <p className="line-clamp-2">{match.text}</p>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => openViewDialog(result.resourceId)}
                        className="mt-2 p-0"
                      >
                        Voir la ressource complète
                      </Button>
                    </AnimatedCard>
                  ))}
                </div>
              )}

              {searchQuery && isSearching && (
                <div className="mt-4 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin" />
                </div>
              )}

              {searchQuery &&
                !isSearching &&
                (!searchResults || searchResults.length === 0) && (
                  <div className="text-muted-foreground mt-4 text-center text-sm">
                    Aucun résultat trouvé
                  </div>
                )}
            </div>
          )}
        </div>
      </BlurFade>

      <BlurFade delay={0.15}>
        <div className="mb-6 flex gap-2">
          <Button
            variant={selectedCategory === undefined ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(undefined)}
          >
            Toutes
          </Button>
          {categories?.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </Button>
          ))}
        </div>
      </BlurFade>

      {filteredResources.length === 0 ? (
        <BlurFade delay={0.2}>
          <AnimatedCard className="border-dashed">
            <div className="flex flex-col items-center justify-center px-6 py-16">
              <div className="bg-primary/10 mb-4 flex size-20 items-center justify-center rounded-2xl">
                <BookOpen className="text-primary/70 size-10" />
              </div>
              <h3 className="mb-2 text-lg font-medium">Aucune ressource</h3>
              <p className="text-muted-foreground max-w-md text-center text-sm">
                Commencez par ajouter votre première ressource pour stocker et
                traiter vos documents business.
              </p>
              <Button
                onClick={() => {
                  resetForm();
                  setCreateDialogOpen(true);
                }}
                className="mt-4"
              >
                <Plus className="mr-2 size-4" />
                Créer une ressource
              </Button>
            </div>
          </AnimatedCard>
        </BlurFade>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredResources.map((resource, index) => (
            <BlurFade key={resource.id} delay={0.2 + index * 0.05}>
              <AnimatedCard className="group relative h-full">
                <div className="flex h-full flex-col p-6">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex-1">
                      {resource.category && (
                        <Badge variant="secondary" className="mb-2">
                          {resource.category}
                        </Badge>
                      )}
                      <h3 className="text-lg font-semibold">
                        {resource.title}
                      </h3>
                    </div>
                    <Badge
                      className={
                        STATUS_COLORS[
                          resource.processingStatus as keyof typeof STATUS_COLORS
                        ]
                      }
                    >
                      {
                        STATUS_LABELS[
                          resource.processingStatus as keyof typeof STATUS_LABELS
                        ]
                      }
                    </Badge>
                  </div>

                  <p className="text-muted-foreground mb-4 line-clamp-3 flex-1 text-sm">
                    {resource.content.substring(0, 200)}
                    {resource.content.length > 200 && "..."}
                  </p>

                  {resource.processingError && (
                    <div className="mb-3">
                      <div className="mb-2 flex items-center gap-2 text-sm text-red-500">
                        <AlertCircle className="size-4" />
                        <span className="line-clamp-1">
                          Erreur de traitement
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          processResourceMutation.mutate({ id: resource.id })
                        }
                        disabled={processResourceMutation.isPending}
                      >
                        <RefreshCw
                          className={`mr-1 size-3 ${processResourceMutation.isPending ? "animate-spin" : ""}`}
                        />
                        Réessayer
                      </Button>
                    </div>
                  )}

                  <div className="text-muted-foreground mb-4 text-xs">
                    {parseResourceMetadata(resource.metadata).charCount}{" "}
                    caractères
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewDialog(resource.id)}
                      className="flex-1"
                    >
                      <Eye className="mr-1 size-4" />
                      Voir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(resource)}
                    >
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeleteDialog(resource.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </AnimatedCard>
            </BlurFade>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Créer une ressource</DialogTitle>
            <DialogDescription>
              Ajoutez une nouvelle ressource business qui sera traitée
              automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Titre</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Avatar client, Objectifs 2024..."
              />
            </div>
            <div>
              <Label htmlFor="category">Catégorie (optionnelle)</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="Marketing, Stratégie, Produit..."
              />
            </div>
            <div>
              <Label htmlFor="content">Contenu</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                placeholder="Collez ici le contenu de votre ressource..."
                rows={12}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                resetForm();
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !formData.title.trim() ||
                !formData.content.trim() ||
                createMutation.isPending
              }
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier la ressource</DialogTitle>
            <DialogDescription>
              Modifiez les informations de votre ressource.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Titre</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-category">Catégorie</Label>
              <Input
                id="edit-category"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-content">Contenu</Label>
              <Textarea
                id="edit-content"
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                rows={12}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                resetForm();
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={
                !formData.title.trim() ||
                !formData.content.trim() ||
                updateMutation.isPending
              }
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{currentResource?.title}</DialogTitle>
            {currentResource?.category && (
              <Badge variant="secondary" className="w-fit">
                {currentResource.category}
              </Badge>
            )}
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <pre className="text-sm break-words whitespace-pre-wrap">
              {currentResource?.content}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette ressource ? Cette action
              est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
