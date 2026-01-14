# ⚡ Optimisation Performance tRPC - Réduction Délais

## 🔍 Analyse des Requêtes Lentes

### Problèmes Identifiés

#### 1. **getYouTubeMetrics** (3299ms)
**Appels API séquentiels** :
1. `connectedAccounts.list()` - ~200ms
2. `toolkits.get("youtube")` - ~300ms
3. `tools.execute("YOUTUBE_GET_CHANNEL_STATISTICS")` - ~500ms
4. `tools.execute("YOUTUBE_LIST_CHANNEL_VIDEOS")` - ~800ms
5. `tools.execute("YOUTUBE_GET_VIDEO_DETAILS_BATCH")` - ~1500ms

**Total**: ~3300ms (séquentiel)

#### 2. **getInstagramMetrics** (3880ms)
**Appels API séquentiels** :
1. `connectedAccounts.list()` - ~200ms
2. `toolkits.get("instagram")` - ~300ms
3. `tools.execute("INSTAGRAM_GET_USER_INFO")` - ~500ms
4. `tools.execute("INSTAGRAM_GET_USER_INSIGHTS")` - ~800ms
5. `tools.execute("INSTAGRAM_GET_USER_MEDIA")` - ~600ms
6. **Boucle** `INSTAGRAM_GET_POST_INSIGHTS` x5 - ~1500ms

**Total**: ~3900ms (séquentiel)

---

## 🚀 Solutions d'Optimisation

### 1. **Cache des Comptes Connectés** ⭐⭐⭐⭐⭐
**Impact**: -200ms par requête

```typescript
// Cache en mémoire pour les comptes connectés
const connectedAccountsCache = new Map<string, {
  accounts: any[];
  timestamp: number;
}>();

const CACHE_TTL = 30 * 1000; // 30 secondes

async function getCachedConnectedAccounts(
  composio: Composio,
  userId: string
) {
  const cacheKey = userId;
  const cached = connectedAccountsCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.accounts;
  }
  
  const result = await composio.connectedAccounts.list({ userIds: [userId] });
  connectedAccountsCache.set(cacheKey, {
    accounts: result.items,
    timestamp: Date.now(),
  });
  
  return result.items;
}
```

### 2. **Cache des Toolkits** ⭐⭐⭐⭐
**Impact**: -300ms par requête

```typescript
// Cache des toolkits (versions changent rarement)
const toolkitCache = new Map<string, {
  toolkit: any;
  timestamp: number;
}>();

const TOOLKIT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedToolkit(composio: Composio, slug: string) {
  const cached = toolkitCache.get(slug);
  
  if (cached && Date.now() - cached.timestamp < TOOLKIT_CACHE_TTL) {
    return cached.toolkit;
  }
  
  const toolkit = await composio.toolkits.get(slug);
  toolkitCache.set(slug, {
    toolkit,
    timestamp: Date.now(),
  });
  
  return toolkit;
}
```

### 3. **Parallélisation des Appels API** ⭐⭐⭐⭐⭐
**Impact**: -60% du temps total (3300ms → ~1300ms)

```typescript
// ✅ AVANT (séquentiel)
const accounts = await composio.connectedAccounts.list(...);
const toolkit = await composio.toolkits.get("youtube");
const stats = await composio.tools.execute(...);
const videos = await composio.tools.execute(...);
const details = await composio.tools.execute(...);

// ✅ APRÈS (parallèle)
const [accounts, toolkit] = await Promise.all([
  getCachedConnectedAccounts(composio, userId),
  getCachedToolkit(composio, "youtube"),
]);

const [stats, videos] = await Promise.all([
  composio.tools.execute("YOUTUBE_GET_CHANNEL_STATISTICS", {...}),
  composio.tools.execute("YOUTUBE_LIST_CHANNEL_VIDEOS", {...}),
]);

// Puis details après avoir les videoIds
const details = await composio.tools.execute(...);
```

### 4. **Réduction du Nombre d'Appels** ⭐⭐⭐⭐
**Impact**: -40% du temps (Instagram)

```typescript
// ❌ AVANT - Boucle séquentielle
for (const media of mediaItems.slice(0, 5)) {
  const postInsights = await composio.tools.execute(...); // 300ms x 5 = 1500ms
}

// ✅ APRÈS - Parallélisation
const postInsightsPromises = mediaItems.slice(0, 5).map((media) =>
  composio.tools.execute("INSTAGRAM_GET_POST_INSIGHTS", {
    arguments: { ig_post_id: media.id, ... },
  })
);

const postInsightsResults = await Promise.all(postInsightsPromises); // ~300ms total
```

### 5. **Réduire les Données Récupérées** ⭐⭐⭐
**Impact**: -20% du temps

```typescript
// Réduire de 10 à 5 vidéos/posts
maxResults: 5, // Au lieu de 10

// Ne récupérer que les 3 premiers pour l'affichage
latestVideos: videosWithStats.slice(0, 3), // Déjà fait
latestPosts: latestPosts.slice(0, 3), // Déjà fait
```

### 6. **React Query Cache Agressif** ⭐⭐⭐⭐
**Impact**: Requêtes suivantes instantanées

```typescript
// src/components/dashboard/integrations-grid.tsx
const { data: youtubeMetrics } = api.integrations.getYouTubeMetrics.useQuery(
  { integrationKey: youtubeSlug },
  {
    enabled: !!youtubeIntegration && youtubeSlug !== "",
    staleTime: 1000 * 60 * 5, // 5 minutes (métriques changent peu)
    gcTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  }
);
```

### 7. **Optimisation Prisma Queries** ⭐⭐⭐
**Impact**: -50ms par requête DB

```typescript
// Utiliser select pour ne récupérer que les champs nécessaires
const user = await db.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    email: true,
    // Ne pas récupérer tous les champs
  },
});
```

---

## 📊 Résultats Attendus

| Requête | Avant | Après | Gain |
|---------|-------|-------|------|
| **getYouTubeMetrics** | 3299ms | ~800ms | **-76%** |
| **getInstagramMetrics** | 3880ms | ~1000ms | **-74%** |
| **getConnected** | 579ms | ~50ms (cache) | **-91%** |
| **list** | 928ms | ~200ms (cache) | **-78%** |

**Total**: De ~7s à ~2s pour toutes les requêtes = **-71%** 🚀

---

## 🎯 Plan d'Implémentation

### Phase 1 (Immédiat - 30 min)
1. ✅ Créer cache pour connectedAccounts
2. ✅ Créer cache pour toolkits
3. ✅ Paralléliser appels dans getYouTubeMetrics

### Phase 2 (15 min)
4. ✅ Paralléliser appels dans getInstagramMetrics
5. ✅ Paralléliser boucle postInsights

### Phase 3 (15 min)
6. ✅ Optimiser React Query config
7. ✅ Réduire nombre de posts/vidéos

**Total**: ~1h pour passer de 7s à 2s ⚡
