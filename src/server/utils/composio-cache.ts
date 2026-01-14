/**
 * Cache pour les appels Composio fréquents
 * Réduit les appels API répétitifs et améliore les performances
 */

import type { Composio } from "@composio/core";

type ConnectedAccount = {
  id: string;
  toolkit?: { slug?: string };
  status: string;
};

type Toolkit = {
  meta?: { availableVersions?: string[] };
  slug?: string;
  name?: string;
  [key: string]: unknown;
};

type CachedData<T> = {
  data: T;
  timestamp: number;
};

// Cache pour les comptes connectés (30 secondes)
const connectedAccountsCache = new Map<
  string,
  CachedData<ConnectedAccount[]>
>();

const CONNECTED_ACCOUNTS_TTL = 30 * 1000; // 30 secondes

// Cache pour les toolkits (5 minutes - changent rarement)
const toolkitCache = new Map<string, CachedData<Toolkit>>();

const TOOLKIT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Récupère les comptes connectés avec cache
 */
export async function getCachedConnectedAccounts(
  composio: Composio,
  userId: string,
): Promise<ConnectedAccount[]> {
  const cacheKey = userId;
  const cached = connectedAccountsCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CONNECTED_ACCOUNTS_TTL) {
    return cached.data;
  }

  const result = await composio.connectedAccounts.list({
    userIds: [userId],
  });

  const accounts = (result.items ?? []) as ConnectedAccount[];
  connectedAccountsCache.set(cacheKey, {
    data: accounts,
    timestamp: Date.now(),
  });

  return accounts;
}

/**
 * Récupère un toolkit avec cache
 */
export async function getCachedToolkit(
  composio: Composio,
  slug: string,
): Promise<Toolkit> {
  const cached = toolkitCache.get(slug);

  if (cached && Date.now() - cached.timestamp < TOOLKIT_CACHE_TTL) {
    return cached.data;
  }

  const toolkit = (await composio.toolkits.get(slug)) as Toolkit;
  toolkitCache.set(slug, {
    data: toolkit,
    timestamp: Date.now(),
  });

  return toolkit;
}

/**
 * Invalide le cache des comptes connectés pour un utilisateur
 */
export function invalidateConnectedAccountsCache(userId: string): void {
  connectedAccountsCache.delete(userId);
}

/**
 * Invalide le cache d'un toolkit
 */
export function invalidateToolkitCache(slug: string): void {
  toolkitCache.delete(slug);
}

/**
 * Nettoie les caches expirés (à appeler périodiquement)
 */
export function cleanupExpiredCaches(): void {
  const now = Date.now();

  // Nettoyer le cache des comptes connectés
  for (const [key, cached] of connectedAccountsCache.entries()) {
    if (now - cached.timestamp >= CONNECTED_ACCOUNTS_TTL) {
      connectedAccountsCache.delete(key);
    }
  }

  // Nettoyer le cache des toolkits
  for (const [key, cached] of toolkitCache.entries()) {
    if (now - cached.timestamp >= TOOLKIT_CACHE_TTL) {
      toolkitCache.delete(key);
    }
  }
}
