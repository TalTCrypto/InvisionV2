/**
 * Système de permissions modulaire et granulaire
 * Chaque permission est atomique et peut être combinée dans des rôles custom
 */

// Types de base
export type Permission = (typeof ALL_PERMISSIONS)[number];

export interface RolePermissions {
  name: string;
  description: string;
  permissions: Permission[];
  isDefault?: boolean;
  isEditable?: boolean;
}

// Toutes les permissions atomiques du système
export const ALL_PERMISSIONS = [
  // Membres
  "members:view",
  "members:invite",
  "members:remove",
  "members:update_role",

  // Organisation
  "org:view",
  "org:edit",
  "org:delete",

  // Intégrations
  "integrations:view",
  "integrations:manage",

  // Chat IA
  "chat:access",

  // Workflows
  "workflows:view",
  "workflows:manage",

  // Rôles
  "roles:view",
  "roles:manage",
] as const;

// Groupes de permissions pour l'UI
export const PERMISSION_GROUPS = {
  members: {
    label: "Membres",
    description: "Gestion des membres de l'équipe",
    permissions: [
      "members:view",
      "members:invite",
      "members:remove",
      "members:update_role",
    ],
  },
  organization: {
    label: "Organisation",
    description: "Paramètres de l'organisation",
    permissions: ["org:view", "org:edit", "org:delete"],
  },
  integrations: {
    label: "Intégrations",
    description: "Connexions aux services externes",
    permissions: ["integrations:view", "integrations:manage"],
  },
  chat: {
    label: "Chat IA",
    description: "Accès au chat et aux agents IA",
    permissions: ["chat:access"],
  },
  workflows: {
    label: "Workflows",
    description: "Gestion des workflows Langflow",
    permissions: ["workflows:view", "workflows:manage"],
  },
  roles: {
    label: "Rôles",
    description: "Gestion des rôles et permissions",
    permissions: ["roles:view", "roles:manage"],
  },
} as const;

// Labels pour chaque permission
export const PERMISSION_LABELS: Record<Permission, string> = {
  "members:view": "Voir les membres",
  "members:invite": "Inviter des membres",
  "members:remove": "Retirer des membres",
  "members:update_role": "Modifier les rôles",
  "org:view": "Voir l'organisation",
  "org:edit": "Modifier l'organisation",
  "org:delete": "Supprimer l'organisation",
  "integrations:view": "Voir les intégrations",
  "integrations:manage": "Gérer les intégrations",
  "chat:access": "Accéder au chat IA",
  "workflows:view": "Voir les workflows",
  "workflows:manage": "Gérer les workflows",
  "roles:view": "Voir les rôles",
  "roles:manage": "Gérer les rôles",
};

// Rôles par défaut (non modifiables mais servent de template)
export const DEFAULT_ROLES: Record<string, RolePermissions> = {
  owner: {
    name: "Propriétaire",
    description: "Accès complet à l'organisation",
    permissions: [...ALL_PERMISSIONS],
    isDefault: true,
    isEditable: false,
  },
  admin: {
    name: "Administrateur",
    description: "Gestion complète sauf suppression de l'organisation",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "org:delete"),
    isDefault: true,
    isEditable: true,
  },
  member: {
    name: "Membre",
    description: "Accès de base aux fonctionnalités",
    permissions: [
      "members:view",
      "org:view",
      "integrations:view",
      "chat:access",
      "workflows:view",
    ],
    isDefault: true,
    isEditable: true,
  },
};

/**
 * Vérifie si un rôle a une permission spécifique
 */
export function hasPermission(
  rolePermissions: Permission[],
  permission: Permission,
): boolean {
  return rolePermissions.includes(permission);
}

/**
 * Vérifie si un rôle a toutes les permissions demandées
 */
export function hasAllPermissions(
  rolePermissions: Permission[],
  requiredPermissions: Permission[],
): boolean {
  return requiredPermissions.every((p) => rolePermissions.includes(p));
}

/**
 * Vérifie si un rôle a au moins une des permissions demandées
 */
export function hasAnyPermission(
  rolePermissions: Permission[],
  requiredPermissions: Permission[],
): boolean {
  return requiredPermissions.some((p) => rolePermissions.includes(p));
}

/**
 * Récupère les permissions par défaut pour un rôle système
 */
export function getDefaultPermissions(role: string): Permission[] {
  const defaultRole = DEFAULT_ROLES[role];
  if (defaultRole) {
    return defaultRole.permissions;
  }
  // Fallback to member permissions
  return [
    "members:view",
    "org:view",
    "integrations:view",
    "chat:access",
    "workflows:view",
  ];
}

/**
 * Parse les permissions depuis une chaîne JSON
 */
export function parsePermissions(permissionJson: string | null): Permission[] {
  if (!permissionJson) return [];
  try {
    const parsed = JSON.parse(permissionJson) as string[];
    return parsed.filter((p): p is Permission =>
      ALL_PERMISSIONS.includes(p as Permission),
    );
  } catch {
    return [];
  }
}

/**
 * Sérialise les permissions en JSON
 */
export function serializePermissions(permissions: Permission[]): string {
  return JSON.stringify(permissions);
}
