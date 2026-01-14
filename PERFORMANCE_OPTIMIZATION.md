# 🚀 Plan d'Optimisation Performance Ultra-Fluide

## 📊 Analyse de la Stack Actuelle

### Stack Technique

- **Framework**: Next.js 15.2.3 (excellent choix)
- **React**: 19.0.0 (dernière version)
- **State Management**: React Query 5.69.0 + tRPC 11.0.0
- **Styling**: Tailwind CSS 4.0.15
- **Animations**: Framer Motion 12.26.2
- **Database**: Prisma + PostgreSQL
- **Auth**: Better Auth

### Points Forts ✅

1. Next.js 15 avec App Router
2. React 19 avec Server Components
3. tRPC pour type-safety
4. React Query pour le cache
5. Standalone output pour Docker

### Points à Optimiser ⚠️

1. Pas de Suspense boundaries optimisés
2. Pas de code splitting stratégique
3. Pas d'optimisation d'images (utilisation de `<img>` au lieu de `next/image`)
4. Pas de prefetching intelligent
5. Pas de streaming SSR optimisé
6. Pas de service worker / PWA
7. Pas de lazy loading des composants lourds
8. Pas de virtualisation pour les listes longues
9. Pas de debouncing/throttling optimisé
10. Pas de memoization stratégique

---

## 🎯 Optimisations Critiques (Priorité 1)

### 1. **Next.js Image Optimization**

**Impact**: ⭐⭐⭐⭐⭐ (Réduction 60-80% du poids des images)

```typescript
// ❌ AVANT
<img src="/logo.png" alt="Logo" />

// ✅ APRÈS
import Image from "next/image";
<Image
  src="/logo.png"
  alt="Logo"
  width={200}
  height={200}
  priority // Pour les images above-the-fold
  loading="lazy" // Pour les images below-the-fold
  placeholder="blur" // Avec blurDataURL
/>
```

**Fichiers à modifier**:

- `src/app/dashboard/integrations/page.tsx` (lignes 222, 323)
- `src/app/onboarding/integrations/page.tsx` (ligne 250)
- `src/components/dashboard/app-sidebar.tsx` (ligne 188)
- `src/components/dashboard/integrations-grid.tsx` (lignes 153, 383, 569)
- `src/components/ui/avatar-circles.tsx` (ligne 29)
- `src/components/ui/hero-video-dialog.tsx` (ligne 88)
- `src/components/ui/iphone.tsx` (ligne 77)
- `src/components/ui/safari.tsx` (ligne 79)

### 2. **Suspense Boundaries Stratégiques**

**Impact**: ⭐⭐⭐⭐⭐ (Perception de vitesse +50%)

```typescript
// src/app/dashboard/chat/page.tsx
import { Suspense } from "react";

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatContent />
    </Suspense>
  );
}

function ChatContent() {
  return (
    <>
      <Suspense fallback={<WorkflowsSkeleton />}>
        <WorkflowsList />
      </Suspense>
      <Suspense fallback={<SessionsSkeleton />}>
        <SessionsList />
      </Suspense>
    </>
  );
}
```

### 3. **React Query Optimizations**

**Impact**: ⭐⭐⭐⭐ (Réduction 40% des requêtes)

```typescript
// src/trpc/query-client.ts
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache plus agressif
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes (ancien cacheTime)
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
        // Prefetching intelligent
        refetchOnMount: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
```

### 4. **Code Splitting Dynamique**

**Impact**: ⭐⭐⭐⭐ (Réduction 40% du bundle initial)

```typescript
// Composants lourds en lazy loading
import dynamic from "next/dynamic";

const Globe = dynamic(() => import("~/components/ui/globe"), {
  loading: () => <GlobeSkeleton />,
  ssr: false, // Si animation canvas
});

const Particles = dynamic(() => import("~/components/ui/particles"), {
  loading: () => <ParticlesSkeleton />,
  ssr: false,
});

const FlickeringGrid = dynamic(() => import("~/components/ui/flickering-grid"), {
  loading: () => <GridSkeleton />,
  ssr: false,
});
```

### 5. **Memoization Stratégique**

**Impact**: ⭐⭐⭐⭐ (Réduction 30% des re-renders)

```typescript
// src/app/dashboard/chat/page.tsx
import { useMemo, useCallback, memo } from "react";

// Memoize les composants enfants
const MessageItem = memo(({ message }: { message: Message }) => {
  // ...
});

// Memoize les callbacks
const handleSendMessage = useCallback(
  async (content: string) => {
    // ...
  },
  [selectedSessionId, selectedWorkflowId],
);

// Memoize les calculs coûteux
const displayMessages = useMemo(() => {
  // ...
}, [currentSession.messages, localMessages, streamingData]);
```

---

## 🚀 Optimisations Avancées (Priorité 2)

### 6. **Streaming SSR avec React 19**

**Impact**: ⭐⭐⭐⭐⭐ (TTFB -50%)

```typescript
// src/app/dashboard/chat/page.tsx
import { Suspense } from "react";

export default async function ChatPage() {
  return (
    <div>
      <Suspense fallback={<ChatHeaderSkeleton />}>
        <ChatHeader />
      </Suspense>
      <Suspense fallback={<ChatContentSkeleton />}>
        <ChatContent />
      </Suspense>
    </div>
  );
}
```

### 7. **Prefetching Intelligent**

**Impact**: ⭐⭐⭐⭐ (Navigation instantanée)

```typescript
// Prefetch sur hover
<Link
  href="/dashboard/chat"
  prefetch={true} // Next.js le fait automatiquement
  onMouseEnter={() => {
    // Prefetch les données critiques
    utils.chat.getSessions.prefetch();
  }}
>
  Chat
</Link>

// Prefetch dans le background
useEffect(() => {
  // Prefetch les workflows au chargement
  utils.chat.getWorkflows.prefetch();
}, []);
```

### 8. **Virtualisation pour Listes Longues**

**Impact**: ⭐⭐⭐⭐⭐ (Performance avec 1000+ items)

```bash
npm install @tanstack/react-virtual
```

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

function MessagesList({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <MessageItem message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 9. **Debouncing/Throttling Optimisé**

**Impact**: ⭐⭐⭐ (Réduction 70% des événements)

```typescript
import { useDebouncedCallback } from "use-debounce";

// Dans le chat
const debouncedScroll = useDebouncedCallback(
  () => {
    scrollToBottom();
  },
  100, // 100ms
);

// Pour les recherches
const debouncedSearch = useDebouncedCallback(
  (value: string) => {
    setSearchQuery(value);
  },
  300, // 300ms
);
```

### 10. **Service Worker + PWA**

**Impact**: ⭐⭐⭐⭐ (Offline + Cache agressif)

```typescript
// next.config.js
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "images",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 jours
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\/api\/trpc\/.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "api",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60, // 5 minutes
        },
      },
    },
  ],
});

module.exports = withPWA({
  // ... config existante
});
```

---

## ⚡ Optimisations Next.js Config

### 11. **Configuration Next.js Optimisée**

**Impact**: ⭐⭐⭐⭐

```typescript
// next.config.js
/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",

  // Optimisations de compilation
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },

  // Optimisations d'images
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Headers de performance
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
    ];
  },

  // Experimental features
  experimental: {
    optimizePackageImports: [
      "@radix-ui/react-icons",
      "lucide-react",
      "framer-motion",
    ],
  },
};

export default config;
```

---

## 🎨 Optimisations UI/UX

### 12. **Skeleton States Optimisés**

**Impact**: ⭐⭐⭐⭐ (Perception de vitesse)

```typescript
// Créer des skeletons pour chaque section
export function ChatSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="w-10 h-10 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 13. **Optimistic Updates Améliorés**

**Impact**: ⭐⭐⭐⭐ (Fluidité perçue)

```typescript
// Déjà fait dans chat/page.tsx mais optimiser
const sendMessage = api.chat.sendMessage.useMutation({
  onMutate: async (newMessage) => {
    // Cancel outgoing refetches
    await utils.chat.getSession.cancel();

    // Snapshot previous value
    const previous = utils.chat.getSession.getData();

    // Optimistically update
    utils.chat.getSession.setData({ sessionId: selectedSessionId! }, (old) => ({
      ...old,
      messages: [...old.messages, newMessage],
    }));

    return { previous };
  },
  onError: (err, newMessage, context) => {
    // Rollback on error
    utils.chat.getSession.setData(
      { sessionId: selectedSessionId! },
      context.previous,
    );
  },
  onSettled: () => {
    utils.chat.getSession.invalidate();
  },
});
```

### 14. **Intersection Observer pour Lazy Loading**

**Impact**: ⭐⭐⭐ (Réduction 50% du rendu initial)

```typescript
// Lazy load les composants lourds
function LazyGlobe() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {isVisible ? <Globe /> : <GlobeSkeleton />}
    </div>
  );
}
```

---

## 🗄️ Optimisations Backend

### 15. **Prisma Query Optimization**

**Impact**: ⭐⭐⭐⭐ (Réduction 40% du temps de requête)

```typescript
// Utiliser select pour ne récupérer que les champs nécessaires
const sessions = await db.chatSession.findMany({
  select: {
    id: true,
    title: true,
    createdAt: true,
    // Ne pas récupérer messages si pas nécessaire
  },
  take: 20, // Pagination
  orderBy: { createdAt: "desc" },
});

// Utiliser include avec parcimonie
const session = await db.chatSession.findUnique({
  where: { id },
  include: {
    messages: {
      take: 50, // Limiter les messages
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        role: true,
        createdAt: true,
      },
    },
  },
});
```

### 16. **Database Indexing**

**Impact**: ⭐⭐⭐⭐⭐ (Réduction 80% du temps de requête)

```prisma
// prisma/schema.prisma
model ChatSession {
  // ...
  @@index([userId, createdAt]) // Pour les requêtes fréquentes
  @@index([organizationId, userId])
}

model Message {
  // ...
  @@index([sessionId, createdAt]) // Pour trier les messages
}
```

### 17. **tRPC Batching Optimisé**

**Impact**: ⭐⭐⭐ (Réduction 30% des requêtes)

```typescript
// Déjà configuré avec httpBatchStreamLink mais optimiser
const trpcClient = api.createClient({
  links: [
    httpBatchStreamLink({
      transformer: SuperJSON,
      url: getBaseUrl() + "/api/trpc",
      maxURLLength: 2083, // Browser limit
      // Batch les requêtes automatiquement
      batch: {
        maxBatchSize: 10,
        maxBatchMs: 10, // 10ms de délai
      },
    }),
  ],
});
```

---

## 📱 Optimisations Mobile

### 18. **Touch Gestures Optimisés**

**Impact**: ⭐⭐⭐ (UX mobile)

```typescript
// Utiliser react-use-gesture pour des gestes fluides
import { useGesture } from "@use-gesture/react";

function SwipeableCard() {
  const bind = useGesture({
    onDrag: ({ movement: [mx], direction: [xDir] }) => {
      // Animation fluide
    },
  });

  return <div {...bind()}>Content</div>;
}
```

### 19. **Viewport Optimizations**

**Impact**: ⭐⭐⭐

```typescript
// next.config.js
const config = {
  // ...
  experimental: {
    viewport: {
      width: "device-width",
      initialScale: 1,
      maximumScale: 5,
    },
  },
};
```

---

## 🔧 Outils de Monitoring

### 20. **Performance Monitoring**

**Impact**: ⭐⭐⭐⭐ (Détection proactive)

```typescript
// src/lib/performance.ts
export function reportWebVitals(metric: any) {
  // Envoyer à votre analytics
  if (metric.label === "web-vital") {
    console.log(metric);
    // Envoyer à Vercel Analytics, Sentry, etc.
  }
}

// Dans _app.tsx ou layout.tsx
export { reportWebVitals };
```

```bash
npm install @vercel/analytics
```

```typescript
// src/app/layout.tsx
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

---

## 📊 Métriques Cibles (YouTube/Facebook Level)

### Objectifs de Performance

| Métrique                           | Cible   | Actuel (estimé) | Action                             |
| ---------------------------------- | ------- | --------------- | ---------------------------------- |
| **LCP** (Largest Contentful Paint) | < 1.2s  | ~2.5s           | Image optimization, code splitting |
| **FID** (First Input Delay)        | < 50ms  | ~100ms          | Code splitting, lazy loading       |
| **CLS** (Cumulative Layout Shift)  | < 0.1   | ~0.2            | Skeleton states, image dimensions  |
| **TTFB** (Time to First Byte)      | < 200ms | ~500ms          | Streaming SSR, caching             |
| **FCP** (First Contentful Paint)   | < 0.8s  | ~1.5s           | Font optimization, critical CSS    |
| **Bundle Size**                    | < 200KB | ~400KB          | Code splitting, tree shaking       |

---

## 🎯 Plan d'Implémentation

### Phase 1 (Impact Immédiat - 1 semaine)

1. ✅ Image optimization (next/image)
2. ✅ Suspense boundaries
3. ✅ React Query optimizations
4. ✅ Code splitting dynamique

### Phase 2 (Performance - 1 semaine)

5. ✅ Virtualisation listes
6. ✅ Debouncing/throttling
7. ✅ Memoization stratégique
8. ✅ Next.js config optimisée

### Phase 3 (Avancé - 1 semaine)

9. ✅ Service Worker + PWA
10. ✅ Database indexing
11. ✅ Prisma query optimization
12. ✅ Performance monitoring

---

## 🚀 Quick Wins (À faire maintenant)

1. **Remplacer tous les `<img>` par `next/image`** (30 min)
2. **Ajouter Suspense boundaries** (1h)
3. **Optimiser React Query config** (15 min)
4. **Lazy load les composants lourds** (30 min)
5. **Ajouter des skeletons** (1h)

**Total**: ~3h pour un gain de performance de 40-50% 🚀

---

## 📚 Ressources

- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [React 19 Performance](https://react.dev/blog/2024/04/25/react-19)
- [Web Vitals](https://web.dev/vitals/)
- [React Query Best Practices](https://tanstack.com/query/latest/docs/react/guides/performance)
