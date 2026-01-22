"use client";

import { useState } from "react";
import {
  Users,
  Shield,
  Settings,
  UserPlus,
  Trash2,
  Mail,
  Clock,
  X,
  Plus,
  Check,
  ChevronDown,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import {
  type Permission,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  DEFAULT_ROLES,
} from "~/lib/permissions";

type TabId = "members" | "roles" | "settings";

const TABS = [
  { id: "members" as const, label: "Membres", icon: Users },
  { id: "roles" as const, label: "Rôles & Permissions", icon: Shield },
  { id: "settings" as const, label: "Paramètres", icon: Settings },
];

export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState<TabId>("members");

  const { data: organization, isLoading: isLoadingOrg } =
    api.organization.getCurrentOrganization.useQuery();
  const { data: myPermissions } = api.organization.getMyPermissions.useQuery();

  if (isLoadingOrg) {
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

  if (!organization) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="py-12 text-center">
          <p className="text-muted-foreground">Organisation non trouvée</p>
        </div>
      </div>
    );
  }

  const canViewMembers = myPermissions?.permissions.includes("members:view");
  const canViewRoles = myPermissions?.permissions.includes("roles:view");
  const canEditOrg = myPermissions?.permissions.includes("org:edit");

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{organization.name}</h1>
        <p className="text-muted-foreground mt-2">
          Gérez votre organisation, vos membres et leurs permissions
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b">
        <nav className="-mb-px flex gap-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            if (tab.id === "members" && !canViewMembers) return null;
            if (tab.id === "roles" && !canViewRoles) return null;
            if (tab.id === "settings" && !canEditOrg) return null;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:border-border hover:text-foreground border-transparent",
                )}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "members" && canViewMembers && <MembersTab />}
      {activeTab === "roles" && canViewRoles && <RolesTab />}
      {activeTab === "settings" && canEditOrg && (
        <SettingsTab organization={organization} />
      )}
    </div>
  );
}

function MembersTab() {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const utils = api.useUtils();
  const { data: members, isLoading } = api.organization.getMembers.useQuery();
  const { data: invitations } =
    api.organization.getPendingInvitations.useQuery();
  const { data: roles } = api.organization.getRoles.useQuery();
  const { data: myPermissions } = api.organization.getMyPermissions.useQuery();

  const canInvite = myPermissions?.permissions.includes("members:invite");
  const canRemove = myPermissions?.permissions.includes("members:remove");
  const canUpdateRole = myPermissions?.permissions.includes(
    "members:update_role",
  );

  const inviteMember = api.organization.inviteMember.useMutation({
    onSuccess: () => {
      void utils.organization.getPendingInvitations.invalidate();
      setIsInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("member");
    },
  });

  const removeMember = api.organization.removeMember.useMutation({
    onSuccess: () => {
      void utils.organization.getMembers.invalidate();
    },
  });

  const updateMemberRole = api.organization.updateMemberRole.useMutation({
    onSuccess: () => {
      void utils.organization.getMembers.invalidate();
    },
  });

  const cancelInvitation = api.organization.cancelInvitation.useMutation({
    onSuccess: () => {
      void utils.organization.getPendingInvitations.invalidate();
    },
  });

  const handleInvite = () => {
    if (!inviteEmail) return;
    inviteMember.mutate({ email: inviteEmail, role: inviteRole });
  };

  const handleRemove = (memberId: string, memberName: string) => {
    if (confirm(`Êtes-vous sûr de vouloir retirer ${memberName} ?`)) {
      removeMember.mutate({ memberId });
    }
  };

  const availableRoles = [
    { value: "admin", label: "Administrateur" },
    { value: "member", label: "Membre" },
    ...(roles ?? []).map((r) => ({ value: r.role, label: r.role })),
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="border-primary size-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Invite Button */}
      {canInvite && (
        <div className="flex justify-end">
          <Button onClick={() => setIsInviteDialogOpen(true)} className="gap-2">
            <UserPlus className="size-4" />
            Inviter un membre
          </Button>
        </div>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle>Membres ({members?.length ?? 0})</CardTitle>
          <CardDescription>
            Membres actuels de l{"'"}organisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {members?.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-muted flex size-10 items-center justify-center rounded-full">
                    {member.user.image ? (
                      <img
                        src={member.user.image}
                        alt={member.user.name ?? ""}
                        className="size-10 rounded-full"
                      />
                    ) : (
                      <span className="text-sm font-medium">
                        {(member.user.name ??
                          member.user.email)?.[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {member.user.name ?? "Sans nom"}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {member.user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {member.role === "owner" ? (
                    <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-medium">
                      Propriétaire
                    </span>
                  ) : canUpdateRole ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        updateMemberRole.mutate({
                          memberId: member.id,
                          role: value,
                        })
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="bg-muted rounded-full px-3 py-1 text-xs font-medium">
                      {member.role === "admin"
                        ? "Administrateur"
                        : member.role === "member"
                          ? "Membre"
                          : member.role}
                    </span>
                  )}

                  {canRemove && member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        handleRemove(
                          member.id,
                          member.user.name ?? member.user.email,
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-5" />
              Invitations en attente ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-muted flex size-10 items-center justify-center rounded-full">
                      <Mail className="text-muted-foreground size-5" />
                    </div>
                    <div>
                      <p className="font-medium">{invitation.email}</p>
                      <p className="text-muted-foreground text-sm">
                        Invité par{" "}
                        {invitation.inviter.name ?? invitation.inviter.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="bg-muted rounded-full px-3 py-1 text-xs font-medium">
                      {invitation.role === "admin"
                        ? "Administrateur"
                        : invitation.role === "member"
                          ? "Membre"
                          : invitation.role}
                    </span>
                    {canInvite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          cancelInvitation.mutate({
                            invitationId: invitation.id,
                          })
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
            <DialogDescription>
              Envoyez une invitation par email pour rejoindre l{"'"}organisation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemple@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Rôle</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsInviteDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail || inviteMember.isPending}
            >
              {inviteMember.isPending ? "Envoi..." : "Envoyer l'invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RolesTab() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>(
    [],
  );

  const utils = api.useUtils();
  const { data: roles, isLoading } = api.organization.getRoles.useQuery();
  const { data: myPermissions } = api.organization.getMyPermissions.useQuery();

  const canManageRoles = myPermissions?.permissions.includes("roles:manage");

  const createRole = api.organization.createRole.useMutation({
    onSuccess: () => {
      void utils.organization.getRoles.invalidate();
      setIsCreateDialogOpen(false);
      setNewRoleName("");
      setSelectedPermissions([]);
    },
  });

  const updateRole = api.organization.updateRole.useMutation({
    onSuccess: () => {
      void utils.organization.getRoles.invalidate();
      setEditingRoleId(null);
    },
  });

  const deleteRole = api.organization.deleteRole.useMutation({
    onSuccess: () => {
      void utils.organization.getRoles.invalidate();
    },
  });

  const handleCreateRole = () => {
    if (!newRoleName || selectedPermissions.length === 0) return;
    createRole.mutate({ role: newRoleName, permissions: selectedPermissions });
  };

  const handleUpdateRole = (roleId: string) => {
    updateRole.mutate({ roleId, permissions: selectedPermissions });
  };

  const handleDeleteRole = (roleId: string, roleName: string) => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le rôle "${roleName}" ?`)) {
      deleteRole.mutate({ roleId });
    }
  };

  const togglePermission = (permission: Permission) => {
    setSelectedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission],
    );
  };

  const startEditRole = (role: { id: string; permissions: Permission[] }) => {
    setEditingRoleId(role.id);
    setSelectedPermissions(role.permissions);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="border-primary size-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {canManageRoles && (
        <div className="flex justify-end">
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <Plus className="size-4" />
            Créer un rôle
          </Button>
        </div>
      )}

      {/* Default Roles Info */}
      <Card>
        <CardHeader>
          <CardTitle>Rôles par défaut</CardTitle>
          <CardDescription>
            Ces rôles sont disponibles dans toutes les organisations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(DEFAULT_ROLES).map(([key, role]) => (
              <div key={key} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-medium">{role.name}</h4>
                  <span className="text-muted-foreground text-xs">
                    {role.permissions.length} permissions
                  </span>
                </div>
                <p className="text-muted-foreground mb-3 text-sm">
                  {role.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.slice(0, 5).map((p) => (
                    <span
                      key={p}
                      className="bg-muted rounded px-2 py-0.5 text-xs"
                    >
                      {PERMISSION_LABELS[p]}
                    </span>
                  ))}
                  {role.permissions.length > 5 && (
                    <span className="text-muted-foreground px-2 py-0.5 text-xs">
                      +{role.permissions.length - 5} autres
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Custom Roles */}
      <Card>
        <CardHeader>
          <CardTitle>Rôles personnalisés</CardTitle>
          <CardDescription>
            Rôles créés spécifiquement pour votre organisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles && roles.length > 0 ? (
            <div className="space-y-4">
              {roles.map((role) => (
                <div key={role.id} className="rounded-lg border p-4">
                  {editingRoleId === role.id ? (
                    <div className="space-y-4">
                      <h4 className="font-medium">{role.role}</h4>
                      <PermissionSelector
                        selectedPermissions={selectedPermissions}
                        onToggle={togglePermission}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateRole(role.id)}
                          disabled={updateRole.isPending}
                        >
                          <Check className="mr-1 size-4" />
                          Sauvegarder
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingRoleId(null)}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="font-medium">{role.role}</h4>
                        {canManageRoles && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <ChevronDown className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => startEditRole(role)}
                              >
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleDeleteRole(role.id, role.role)
                                }
                                className="text-destructive"
                              >
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {role.permissions.slice(0, 5).map((p) => (
                          <span
                            key={p}
                            className="bg-muted rounded px-2 py-0.5 text-xs"
                          >
                            {PERMISSION_LABELS[p]}
                          </span>
                        ))}
                        {role.permissions.length > 5 && (
                          <span className="text-muted-foreground px-2 py-0.5 text-xs">
                            +{role.permissions.length - 5} autres
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              Aucun rôle personnalisé créé
            </p>
          )}
        </CardContent>
      </Card>

      {/* Create Role Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Créer un rôle</DialogTitle>
            <DialogDescription>
              Définissez un nouveau rôle avec des permissions personnalisées
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="roleName">Nom du rôle</Label>
              <Input
                id="roleName"
                placeholder="Ex: Éditeur, Modérateur..."
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Permissions</Label>
              <PermissionSelector
                selectedPermissions={selectedPermissions}
                onToggle={togglePermission}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreateRole}
              disabled={
                !newRoleName ||
                selectedPermissions.length === 0 ||
                createRole.isPending
              }
            >
              {createRole.isPending ? "Création..." : "Créer le rôle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermissionSelector({
  selectedPermissions,
  onToggle,
}: {
  selectedPermissions: Permission[];
  onToggle: (permission: Permission) => void;
}) {
  return (
    <div className="max-h-80 space-y-6 overflow-y-auto rounded-lg border p-4">
      {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
        <div key={groupKey}>
          <h5 className="mb-1 text-sm font-medium">{group.label}</h5>
          <p className="text-muted-foreground mb-3 text-xs">
            {group.description}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {group.permissions.map((permission) => (
              <label
                key={permission}
                className="flex cursor-pointer items-center gap-2"
              >
                <Checkbox
                  checked={selectedPermissions.includes(permission)}
                  onCheckedChange={() => onToggle(permission)}
                />
                <span className="text-sm">{PERMISSION_LABELS[permission]}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsTab({
  organization,
}: {
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
}) {
  const [name, setName] = useState(organization.name);
  const [logo, setLogo] = useState(organization.logo ?? "");

  const utils = api.useUtils();

  const updateOrganization = api.organization.updateOrganization.useMutation({
    onSuccess: () => {
      void utils.organization.getCurrentOrganization.invalidate();
    },
  });

  const handleSave = () => {
    updateOrganization.mutate({
      name: name !== organization.name ? name : undefined,
      logo: logo !== (organization.logo ?? "") ? logo || null : undefined,
    });
  };

  const hasChanges =
    name !== organization.name || logo !== (organization.logo ?? "");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informations de l{"'"}organisation</CardTitle>
          <CardDescription>
            Modifiez les informations de base de votre organisation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Nom de l{"'"}organisation</Label>
            <Input
              id="orgName"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="orgSlug">Slug (identifiant unique)</Label>
            <Input id="orgSlug" value={organization.slug} disabled />
            <p className="text-muted-foreground text-xs">
              Le slug ne peut pas être modifié
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orgLogo">URL du logo</Label>
            <Input
              id="orgLogo"
              type="url"
              placeholder="https://exemple.com/logo.png"
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateOrganization.isPending}
          >
            {updateOrganization.isPending
              ? "Sauvegarde..."
              : "Sauvegarder les modifications"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
