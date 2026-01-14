"use client";

import { useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { AnimatedCard } from "~/components/ui/animated-card";
import { Checkbox } from "~/components/ui/checkbox";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

export default function AdminWorkflowsPage() {
  // La vérification admin se fait dans le layout parent
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<string | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<string | null>(null);

  const utils = api.useUtils();

  // Queries
  const { data: workflows, isLoading: isLoadingWorkflows } =
    api.admin.listWorkflows.useQuery();
  const { data: organizations, isLoading: isLoadingOrgs } =
    api.admin.listOrganizations.useQuery();
  const { data: availableIntegrations } = api.integrations.list.useQuery();

  // Mutations
  const createWorkflow = api.admin.createWorkflow.useMutation({
    onSuccess: () => {
      setIsCreateDialogOpen(false);
      void utils.admin.listWorkflows.invalidate();
    },
  });

  const updateWorkflow = api.admin.updateWorkflow.useMutation({
    onSuccess: () => {
      setEditingWorkflow(null);
      void utils.admin.listWorkflows.invalidate();
    },
  });

  const deleteWorkflow = api.admin.deleteWorkflow.useMutation({
    onSuccess: () => {
      setDeletingWorkflow(null);
      void utils.admin.listWorkflows.invalidate();
    },
  });

  if (isLoadingWorkflows || isLoadingOrgs) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Gestion des Workflows</h1>
        <p className="text-muted-foreground mt-2">
          Créez et gérez les workflows Langflow pour les organisations
        </p>
      </div>

      <div className="space-y-6">
        {/* Header avec bouton */}
        <div className="flex items-center justify-end">
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" />
                Créer un workflow
              </Button>
            </DialogTrigger>
            <CreateWorkflowDialog
              organizations={organizations ?? []}
              availableIntegrations={availableIntegrations}
              onCreate={(data) => {
                createWorkflow.mutate(data);
              }}
              isLoading={createWorkflow.isPending}
            />
          </Dialog>
        </div>

        {/* Liste des workflows */}
        {workflows && workflows.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                organizations={organizations ?? []}
                onEdit={() => setEditingWorkflow(workflow.id)}
                onDelete={() => setDeletingWorkflow(workflow.id)}
              />
            ))}
          </div>
        ) : (
          <AnimatedCard className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">
              Aucun workflow créé. Créez-en un pour commencer.
            </p>
          </AnimatedCard>
        )}

        {/* Dialog d'édition */}
        {editingWorkflow && workflows && (
          <EditWorkflowDialog
            workflow={workflows.find((w) => w.id === editingWorkflow)!}
            organizations={organizations ?? []}
            availableIntegrations={availableIntegrations}
            onUpdate={(data) => {
              updateWorkflow.mutate({
                workflowId: editingWorkflow,
                ...data,
              });
            }}
            onClose={() => setEditingWorkflow(null)}
            isLoading={updateWorkflow.isPending}
          />
        )}

        {/* Dialog de suppression */}
        {deletingWorkflow && workflows && (
          <AlertDialog
            open={!!deletingWorkflow}
            onOpenChange={(open) => !open && setDeletingWorkflow(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer le workflow ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. Le workflow sera supprimé
                  définitivement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    deleteWorkflow.mutate({ workflowId: deletingWorkflow });
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteWorkflow.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

// Carte de workflow
function WorkflowCard({
  workflow,
  organizations: _organizations,
  onEdit,
  onDelete,
}: {
  workflow: {
    id: string;
    name: string;
    description: string | null;
    category: string;
    isActive: boolean;
    workflowId: string;
    allOrganizations: boolean;
    requiredIntegrations?: string[] | null;
    organizations: Array<{ id: string; name: string; slug: string }>;
  };
  organizations: Array<{ id: string; name: string }>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <AnimatedCard className="group relative flex flex-col p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="font-semibold">{workflow.name}</h3>
            {workflow.isActive ? (
              <CheckCircle2 className="size-4 text-green-600" />
            ) : (
              <XCircle className="text-muted-foreground size-4" />
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {workflow.allOrganizations
              ? "Toutes les organisations"
              : workflow.organizations.length > 0
                ? workflow.organizations.map((o) => o.name).join(", ")
                : "Aucune organisation"}
          </p>
        </div>
        <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onEdit}
          >
            <Edit2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive size-8"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {workflow.description && (
        <p className="text-muted-foreground mb-4 line-clamp-2 text-sm">
          {workflow.description}
        </p>
      )}

      <div className="mt-auto space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Catégorie</span>
          <span className="font-medium capitalize">{workflow.category}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">ID Langflow</span>
          <span className="max-w-[120px] truncate font-mono text-[10px]">
            {workflow.workflowId}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Statut</span>
          <span
            className={cn(
              "font-medium",
              workflow.isActive ? "text-green-600" : "text-muted-foreground",
            )}
          >
            {workflow.isActive ? "Actif" : "Inactif"}
          </span>
        </div>
        {workflow.requiredIntegrations &&
          workflow.requiredIntegrations.length > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Intégrations requises
              </span>
              <span className="font-medium">
                {workflow.requiredIntegrations.length}
              </span>
            </div>
          )}
      </div>
    </AnimatedCard>
  );
}

// Dialog de création
function CreateWorkflowDialog({
  organizations,
  availableIntegrations,
  onCreate,
  isLoading,
}: {
  organizations: Array<{ id: string; name: string }>;
  availableIntegrations?: Array<{ slug: string; name?: string }>;
  onCreate: (data: {
    organizationIds?: string[];
    allOrganizations: boolean;
    name: string;
    description?: string;
    workflowId: string;
    category: string;
    isActive: boolean;
    config?: Record<string, unknown>;
    allowedRoles?: string[];
    allowedUserIds?: string[];
    requiredIntegrations?: string[];
    organizationRestrictions?: Array<{
      organizationId: string;
      allowedRoles?: string[];
      allowedUserIds?: string[];
    }>;
  }) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    organizationIds: [] as string[],
    allOrganizations: false,
    name: "",
    description: "",
    workflowId: "",
    category: "orchestrator",
    isActive: true,
    allowedRoles: [] as string[],
    allowedUserIds: [] as string[],
    restrictAccess: false,
    customRoles: "" as string, // Input text pour les rôles custom
    tweaks: "{}" as string, // JSON string des tweaks
    requiredIntegrations: [] as string[], // Slugs des intégrations requises
  });

  // Récupérer les membres des organisations sélectionnées
  const { data: allMembers } = api.admin.listOrganizationMembers.useQuery(
    { organizationId: formData.organizationIds[0] ?? "" },
    {
      enabled:
        formData.organizationIds.length > 0 && !formData.allOrganizations,
    },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Parser les rôles custom depuis l'input text
    const customRolesArray = formData.customRoles
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    const allRoles = [...formData.allowedRoles, ...customRolesArray];

    // Parser les tweaks JSON avec validation améliorée
    let parsedTweaks: Record<string, unknown> | undefined;

    // Nettoyer le JSON : enlever les espaces superflus et caractères invisibles
    const cleanedTweaks = formData.tweaks
      .trim()
      // Remplacer les guillemets typographiques par des guillemets droits (JSON standard)
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Enlever les caractères de contrôle invisibles (sauf les retours à la ligne et tabulations qui sont valides en JSON)
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "")
      // Enlever les espaces en fin de chaque ligne (mais garder l'indentation)
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");

    // Si vide, on peut passer undefined
    if (!cleanedTweaks || cleanedTweaks === "{}" || cleanedTweaks === "") {
      parsedTweaks = undefined;
    } else {
      try {
        // Parser le JSON (JSON.parse gère déjà les espaces, retours à la ligne, tabulations, etc.)
        parsedTweaks = JSON.parse(cleanedTweaks) as Record<string, unknown>;

        // Vérifier que c'est bien un objet
        if (
          typeof parsedTweaks !== "object" ||
          parsedTweaks === null ||
          Array.isArray(parsedTweaks)
        ) {
          alert(
            "Les tweaks doivent être un objet JSON valide (pas un tableau ou une valeur primitive).",
          );
          return;
        }
      } catch (error) {
        // Améliorer le message d'erreur avec plus de détails
        const errorMessage =
          error instanceof Error ? error.message : "Erreur inconnue";
        // Essayer de trouver la position de l'erreur si possible
        let positionInfo = "";
        if (
          error instanceof SyntaxError &&
          error.message.includes("position")
        ) {
          positionInfo = `\nPosition approximative de l'erreur dans le JSON.`;
        }
        alert(
          `Erreur dans le format JSON des tweaks:${positionInfo}\n\n${errorMessage}\n\nVérifiez que votre JSON est valide (guillemets, virgules, accolades).`,
        );
        return;
      }
    }

    onCreate({
      organizationIds: formData.allOrganizations
        ? undefined
        : formData.organizationIds,
      allOrganizations: formData.allOrganizations,
      name: formData.name,
      description: formData.description || undefined,
      workflowId: formData.workflowId,
      category: formData.category,
      isActive: formData.isActive,
      config:
        parsedTweaks && Object.keys(parsedTweaks).length > 0
          ? { tweaks: parsedTweaks }
          : undefined,
      allowedRoles:
        formData.restrictAccess && allRoles.length > 0 ? allRoles : undefined,
      allowedUserIds:
        formData.restrictAccess && formData.allowedUserIds.length > 0
          ? formData.allowedUserIds
          : undefined,
      requiredIntegrations:
        formData.requiredIntegrations.length > 0
          ? formData.requiredIntegrations
          : undefined,
    });
    // Reset form
    setFormData({
      organizationIds: [],
      allOrganizations: false,
      name: "",
      description: "",
      workflowId: "",
      category: "orchestrator",
      isActive: true,
      allowedRoles: [],
      allowedUserIds: [],
      restrictAccess: false,
      customRoles: "",
      tweaks: "{}",
      requiredIntegrations: [],
    });
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Créer un workflow</DialogTitle>
        <DialogDescription>
          Créez un nouveau workflow Langflow et assignez-le à une organisation
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Colonne gauche */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assignation *</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="allOrganizations"
                    checked={formData.allOrganizations}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        allOrganizations: checked === true,
                        organizationIds:
                          checked === true ? [] : formData.organizationIds,
                      })
                    }
                  />
                  <Label
                    htmlFor="allOrganizations"
                    className="cursor-pointer font-medium"
                  >
                    Toutes les organisations
                  </Label>
                </div>

                {!formData.allOrganizations && (
                  <div className="space-y-2 rounded-lg border p-3">
                    <Label className="text-sm font-medium">
                      Organisations spécifiques
                    </Label>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {organizations.map((org) => (
                        <div
                          key={org.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`org-${org.id}`}
                            checked={formData.organizationIds.includes(org.id)}
                            onCheckedChange={(checked) => {
                              if (checked === true) {
                                setFormData({
                                  ...formData,
                                  organizationIds: [
                                    ...formData.organizationIds,
                                    org.id,
                                  ],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  organizationIds:
                                    formData.organizationIds.filter(
                                      (id) => id !== org.id,
                                    ),
                                });
                              }
                            }}
                          />
                          <Label
                            htmlFor={`org-${org.id}`}
                            className="cursor-pointer text-sm"
                          >
                            {org.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {formData.organizationIds.length === 0 && (
                      <p className="text-muted-foreground text-xs">
                        Sélectionnez au moins une organisation
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nom du workflow *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Orchestrateur Principal"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Workflow principal pour l'organisation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workflowId">ID du workflow Langflow *</Label>
              <Input
                id="workflowId"
                value={formData.workflowId}
                onChange={(e) =>
                  setFormData({ ...formData, workflowId: e.target.value })
                }
                placeholder="f9f60077-e4af-4900-a133-7fa6966117c7"
                required
              />
              <p className="text-muted-foreground text-xs">
                L{"'"}ID du workflow dans Langflow
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Catégorie *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orchestrator">Orchestrateur</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="border-border size-4 rounded"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Activer ce workflow
              </Label>
            </div>
          </div>

          {/* Colonne droite */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tweaks">Configuration des Tweaks (JSON)</Label>
              <Textarea
                id="tweaks"
                value={formData.tweaks}
                onChange={(e) =>
                  setFormData({ ...formData, tweaks: e.target.value })
                }
                placeholder={`{
  "Chroma-Tpsjm": {
    "collection_name": "{{organizationId}}"
  },
  "Chroma-8JjDX": {
    "collection_name": "{{organizationId}}"
  },
  "AutreComposant": {
    "param1": "value1",
    "param2": "{{organizationId}}"
  }
}`}
                className="font-mono text-sm"
                rows={10}
              />
              <p className="text-muted-foreground text-xs">
                Variables disponibles :{" "}
                <code className="bg-muted rounded px-1">
                  {"{{organizationId}}"}
                </code>
                , <code className="bg-muted rounded px-1">{"{{userId}}"}</code>,{" "}
                <code className="bg-muted rounded px-1">{"{{sessionId}}"}</code>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Intégrations requises</Label>
              <p className="text-muted-foreground mb-2 text-xs">
                Sélectionnez les intégrations nécessaires pour exécuter ce
                workflow. Les utilisateurs devront les connecter avant de
                pouvoir utiliser ce workflow.
              </p>
              {availableIntegrations && availableIntegrations.length > 0 ? (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {availableIntegrations.map((integration) => (
                    <div
                      key={integration.slug}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`integration-${integration.slug}`}
                        checked={formData.requiredIntegrations.includes(
                          integration.slug,
                        )}
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            setFormData({
                              ...formData,
                              requiredIntegrations: [
                                ...formData.requiredIntegrations,
                                integration.slug,
                              ],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              requiredIntegrations:
                                formData.requiredIntegrations.filter(
                                  (slug) => slug !== integration.slug,
                                ),
                            });
                          }
                        }}
                      />
                      <Label
                        htmlFor={`integration-${integration.slug}`}
                        className="cursor-pointer text-sm"
                      >
                        {integration.name ?? integration.slug}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Aucune intégration disponible
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="restrictAccess"
                checked={formData.restrictAccess}
                onChange={(e) =>
                  setFormData({ ...formData, restrictAccess: e.target.checked })
                }
                className="border-border size-4 rounded"
              />
              <Label htmlFor="restrictAccess" className="cursor-pointer">
                Restreindre l{"'"}accès (par défaut, accessible à toute l{"'"}
                organisation)
              </Label>
            </div>
          </div>
        </div>

        {formData.restrictAccess && (
          <div className="col-span-2 space-y-4 rounded-lg border p-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Rôles autorisés</Label>
                <div className="space-y-3">
                  <div className="space-y-2">
                    {(["owner", "admin", "member"] as const).map((role) => (
                      <div key={role} className="flex items-center space-x-2">
                        <Checkbox
                          id={`role-${role}`}
                          checked={formData.allowedRoles.includes(role)}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setFormData({
                                ...formData,
                                allowedRoles: [...formData.allowedRoles, role],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                allowedRoles: formData.allowedRoles.filter(
                                  (r) => r !== role,
                                ),
                              });
                            }
                          }}
                        />
                        <Label
                          htmlFor={`role-${role}`}
                          className="cursor-pointer capitalize"
                        >
                          {role === "owner"
                            ? "Propriétaire"
                            : role === "admin"
                              ? "Administrateur"
                              : "Membre"}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customRoles" className="text-sm">
                      Rôles personnalisés (séparés par des virgules)
                    </Label>
                    <Input
                      id="customRoles"
                      value={formData.customRoles}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customRoles: e.target.value,
                        })
                      }
                      placeholder="manager, editor, viewer"
                      className="text-sm"
                    />
                    <p className="text-muted-foreground text-xs">
                      Exemple: manager, editor, viewer
                    </p>
                  </div>
                </div>
              </div>

              {allMembers && allMembers.length > 0 && (
                <div className="space-y-2">
                  <Label>Utilisateurs autorisés</Label>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {allMembers.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={`user-${member.userId}`}
                          checked={formData.allowedUserIds.includes(
                            member.userId,
                          )}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setFormData({
                                ...formData,
                                allowedUserIds: [
                                  ...formData.allowedUserIds,
                                  member.userId,
                                ],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                allowedUserIds: formData.allowedUserIds.filter(
                                  (id) => id !== member.userId,
                                ),
                              });
                            }
                          }}
                        />
                        <Label
                          htmlFor={`user-${member.userId}`}
                          className="cursor-pointer text-sm"
                        >
                          {member.userName ?? member.userEmail} (
                          {member.role === "owner"
                            ? "Propriétaire"
                            : member.role === "admin"
                              ? "Admin"
                              : "Membre"}
                          )
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Création...
              </>
            ) : (
              "Créer"
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// Dialog d'édition
function EditWorkflowDialog({
  workflow,
  organizations,
  availableIntegrations,
  onUpdate,
  onClose,
  isLoading,
}: {
  workflow: {
    id: string;
    name: string;
    description: string | null;
    workflowId: string;
    category: string;
    isActive: boolean;
    allOrganizations: boolean;
    config?: Record<string, unknown> | null;
    allowedRoles?: string[] | null;
    allowedUserIds?: string[] | null;
    requiredIntegrations?: string[] | null;
    organizations: Array<{
      id: string;
      name: string;
      slug: string;
      allowedRoles?: string[] | null;
      allowedUserIds?: string[] | null;
    }>;
  };
  organizations: Array<{ id: string; name: string }>;
  availableIntegrations?: Array<{ slug: string; name?: string }>;
  onUpdate: (data: {
    name?: string;
    description?: string;
    workflowIdLangflow?: string;
    category?: string;
    isActive?: boolean;
    allOrganizations?: boolean;
    config?: Record<string, unknown>;
    allowedRoles?: string[];
    allowedUserIds?: string[];
    requiredIntegrations?: string[];
    organizationIds?: string[];
    organizationRestrictions?: Array<{
      organizationId: string;
      allowedRoles?: string[];
      allowedUserIds?: string[];
    }>;
  }) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  // Parser la config pour extraire les tweaks
  // workflow.config est déjà parsé depuis listWorkflows
  const initialTweaks = (() => {
    try {
      const config = workflow.config as
        | { tweaks?: Record<string, unknown> }
        | null
        | undefined;
      return JSON.stringify(config?.tweaks ?? {}, null, 2);
    } catch {
      return "{}";
    }
  })();

  const [formData, setFormData] = useState({
    organizationIds: workflow.organizations.map((o) => o.id),
    allOrganizations: workflow.allOrganizations,
    name: workflow.name,
    description: workflow.description ?? "",
    workflowId: workflow.workflowId,
    category: workflow.category,
    isActive: workflow.isActive,
    requiredIntegrations: workflow.requiredIntegrations ?? [],
    allowedRoles: workflow.allowedRoles ?? [],
    allowedUserIds: workflow.allowedUserIds ?? [],
    restrictAccess: !!(workflow.allowedRoles ?? workflow.allowedUserIds),
    customRoles: (() => {
      // Extraire les rôles custom (non-standard) pour l'initialisation
      const standardRoles = ["owner", "admin", "member"];
      const initialAllowedRoles = workflow.allowedRoles ?? [];
      return initialAllowedRoles
        .filter((r) => !standardRoles.includes(r))
        .join(", ");
    })(),
    tweaks: initialTweaks,
  });

  // Extraire les rôles custom (non-standard) pour l'affichage
  const standardRoles = ["owner", "admin", "member"];
  const customRolesArray = formData.allowedRoles.filter(
    (r) => !standardRoles.includes(r),
  );
  const standardRolesArray = formData.allowedRoles.filter((r) =>
    standardRoles.includes(r),
  );

  // Récupérer les membres des organisations sélectionnées
  const { data: allMembers } = api.admin.listOrganizationMembers.useQuery(
    { organizationId: formData.organizationIds[0] ?? "" },
    {
      enabled:
        formData.organizationIds.length > 0 && !formData.allOrganizations,
    },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Parser les rôles custom depuis l'input text
    const customRolesFromInput = formData.customRoles
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    const allRoles = [...formData.allowedRoles, ...customRolesFromInput];

    // Parser les tweaks JSON avec validation améliorée
    let parsedTweaks: Record<string, unknown> | undefined;

    // Nettoyer le JSON : enlever les espaces superflus et caractères invisibles
    const cleanedTweaks = formData.tweaks
      .trim()
      // Remplacer les guillemets typographiques par des guillemets droits (JSON standard)
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Enlever les caractères de contrôle invisibles (sauf les retours à la ligne et tabulations qui sont valides en JSON)
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "")
      // Enlever les espaces en fin de chaque ligne (mais garder l'indentation)
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");

    // Si vide, on peut passer undefined
    if (!cleanedTweaks || cleanedTweaks === "{}" || cleanedTweaks === "") {
      parsedTweaks = undefined;
    } else {
      try {
        // Parser le JSON (JSON.parse gère déjà les espaces, retours à la ligne, tabulations, etc.)
        parsedTweaks = JSON.parse(cleanedTweaks) as Record<string, unknown>;

        // Vérifier que c'est bien un objet
        if (
          typeof parsedTweaks !== "object" ||
          parsedTweaks === null ||
          Array.isArray(parsedTweaks)
        ) {
          alert(
            "Les tweaks doivent être un objet JSON valide (pas un tableau ou une valeur primitive).",
          );
          return;
        }
      } catch (error) {
        // Améliorer le message d'erreur avec plus de détails
        const errorMessage =
          error instanceof Error ? error.message : "Erreur inconnue";
        // Essayer de trouver la position de l'erreur si possible
        let positionInfo = "";
        if (
          error instanceof SyntaxError &&
          error.message.includes("position")
        ) {
          positionInfo = `\nPosition approximative de l'erreur dans le JSON.`;
        }
        alert(
          `Erreur dans le format JSON des tweaks:${positionInfo}\n\n${errorMessage}\n\nVérifiez que votre JSON est valide (guillemets, virgules, accolades).`,
        );
        return;
      }
    }

    onUpdate({
      name: formData.name,
      description: formData.description || undefined,
      workflowIdLangflow: formData.workflowId,
      category: formData.category,
      isActive: formData.isActive,
      allOrganizations: formData.allOrganizations,
      organizationIds: formData.allOrganizations
        ? undefined
        : formData.organizationIds,
      config:
        parsedTweaks && Object.keys(parsedTweaks).length > 0
          ? { tweaks: parsedTweaks }
          : undefined,
      allowedRoles:
        formData.restrictAccess && allRoles.length > 0 ? allRoles : undefined,
      allowedUserIds:
        formData.restrictAccess && formData.allowedUserIds.length > 0
          ? formData.allowedUserIds
          : undefined,
      requiredIntegrations:
        formData.requiredIntegrations.length > 0
          ? formData.requiredIntegrations
          : undefined,
    });
  };

  return (
    <Dialog open={!!workflow} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le workflow</DialogTitle>
          <DialogDescription>
            Modifiez les informations du workflow
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Colonne gauche */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Assignation *</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-allOrganizations"
                      checked={formData.allOrganizations}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          allOrganizations: checked === true,
                          organizationIds:
                            checked === true ? [] : formData.organizationIds,
                        })
                      }
                    />
                    <Label
                      htmlFor="edit-allOrganizations"
                      className="cursor-pointer font-medium"
                    >
                      Toutes les organisations
                    </Label>
                  </div>

                  {!formData.allOrganizations && (
                    <div className="space-y-2 rounded-lg border p-3">
                      <Label className="text-sm font-medium">
                        Organisations spécifiques
                      </Label>
                      <div className="max-h-48 space-y-2 overflow-y-auto">
                        {organizations.map((org) => (
                          <div
                            key={org.id}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`edit-org-${org.id}`}
                              checked={formData.organizationIds.includes(
                                org.id,
                              )}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  setFormData({
                                    ...formData,
                                    organizationIds: [
                                      ...formData.organizationIds,
                                      org.id,
                                    ],
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    organizationIds:
                                      formData.organizationIds.filter(
                                        (id) => id !== org.id,
                                      ),
                                  });
                                }
                              }}
                            />
                            <Label
                              htmlFor={`edit-org-${org.id}`}
                              className="cursor-pointer text-sm"
                            >
                              {org.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-name">Nom du workflow *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-workflowId">
                  ID du workflow Langflow *
                </Label>
                <Input
                  id="edit-workflowId"
                  value={formData.workflowId}
                  onChange={(e) =>
                    setFormData({ ...formData, workflowId: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-category">Catégorie *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData({ ...formData, category: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orchestrator">Orchestrateur</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="other">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked === true })
                  }
                />
                <Label htmlFor="edit-isActive" className="cursor-pointer">
                  Activer ce workflow
                </Label>
              </div>
            </div>

            {/* Colonne droite */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-tweaks">
                  Configuration des Tweaks (JSON)
                </Label>
                <Textarea
                  id="edit-tweaks"
                  value={formData.tweaks}
                  onChange={(e) =>
                    setFormData({ ...formData, tweaks: e.target.value })
                  }
                  placeholder={`{
  "Chroma-Tpsjm": {
    "collection_name": "{{organizationId}}"
  },
  "Chroma-8JjDX": {
    "collection_name": "{{organizationId}}"
  },
  "AutreComposant": {
    "param1": "value1",
    "param2": "{{organizationId}}"
  }
}`}
                  className="font-mono text-sm"
                  rows={10}
                />
                <p className="text-muted-foreground text-xs">
                  Variables disponibles :{" "}
                  <code className="bg-muted rounded px-1">
                    {"{{organizationId}}"}
                  </code>
                  ,{" "}
                  <code className="bg-muted rounded px-1">{"{{userId}}"}</code>,{" "}
                  <code className="bg-muted rounded px-1">
                    {"{{sessionId}}"}
                  </code>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Intégrations requises</Label>
                <p className="text-muted-foreground mb-2 text-xs">
                  Sélectionnez les intégrations nécessaires pour exécuter ce
                  workflow. Les utilisateurs devront les connecter avant de
                  pouvoir utiliser ce workflow.
                </p>
                {availableIntegrations && availableIntegrations.length > 0 ? (
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                    {availableIntegrations.map((integration) => (
                      <div
                        key={integration.slug}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={`edit-integration-${integration.slug}`}
                          checked={formData.requiredIntegrations.includes(
                            integration.slug,
                          )}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setFormData({
                                ...formData,
                                requiredIntegrations: [
                                  ...formData.requiredIntegrations,
                                  integration.slug,
                                ],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                requiredIntegrations:
                                  formData.requiredIntegrations.filter(
                                    (slug) => slug !== integration.slug,
                                  ),
                              });
                            }
                          }}
                        />
                        <Label
                          htmlFor={`edit-integration-${integration.slug}`}
                          className="cursor-pointer text-sm"
                        >
                          {integration.name ?? integration.slug}
                        </Label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Aucune intégration disponible
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-restrictAccess"
                  checked={formData.restrictAccess}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      restrictAccess: checked === true,
                    })
                  }
                />
                <Label htmlFor="edit-restrictAccess" className="cursor-pointer">
                  Restreindre l{"'"}accès (par défaut, accessible à toute l{"'"}
                  organisation)
                </Label>
              </div>
            </div>
          </div>

          {formData.restrictAccess && (
            <div className="col-span-2 space-y-4 rounded-lg border p-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Rôles autorisés</Label>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {(["owner", "admin", "member"] as const).map((role) => (
                        <div key={role} className="flex items-center space-x-2">
                          <Checkbox
                            id={`edit-role-${role}`}
                            checked={standardRolesArray.includes(role)}
                            onCheckedChange={(checked) => {
                              if (checked === true) {
                                setFormData({
                                  ...formData,
                                  allowedRoles: [
                                    ...formData.allowedRoles,
                                    role,
                                  ],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  allowedRoles: formData.allowedRoles.filter(
                                    (r) => r !== role,
                                  ),
                                });
                              }
                            }}
                          />
                          <Label
                            htmlFor={`edit-role-${role}`}
                            className="cursor-pointer capitalize"
                          >
                            {role === "owner"
                              ? "Propriétaire"
                              : role === "admin"
                                ? "Administrateur"
                                : "Membre"}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-customRoles" className="text-sm">
                        Rôles personnalisés (séparés par des virgules)
                      </Label>
                      <Input
                        id="edit-customRoles"
                        value={formData.customRoles}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            customRoles: e.target.value,
                          })
                        }
                        placeholder={
                          customRolesArray.join(", ") ||
                          "manager, editor, viewer"
                        }
                        className="text-sm"
                      />
                      <p className="text-muted-foreground text-xs">
                        Exemple: manager, editor, viewer
                      </p>
                    </div>
                  </div>
                </div>

                {allMembers && allMembers.length > 0 && (
                  <div className="space-y-2">
                    <Label>Utilisateurs autorisés</Label>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {allMembers.map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`edit-user-${member.userId}`}
                            checked={formData.allowedUserIds.includes(
                              member.userId,
                            )}
                            onCheckedChange={(checked) => {
                              if (checked === true) {
                                setFormData({
                                  ...formData,
                                  allowedUserIds: [
                                    ...formData.allowedUserIds,
                                    member.userId,
                                  ],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  allowedUserIds:
                                    formData.allowedUserIds.filter(
                                      (id) => id !== member.userId,
                                    ),
                                });
                              }
                            }}
                          />
                          <Label
                            htmlFor={`edit-user-${member.userId}`}
                            className="cursor-pointer text-sm"
                          >
                            {member.userName ?? member.userEmail} (
                            {member.role === "owner"
                              ? "Propriétaire"
                              : member.role === "admin"
                                ? "Admin"
                                : "Membre"}
                            )
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
