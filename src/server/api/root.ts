import { adminRouter } from "~/server/api/routers/admin";
import { onboardingRouter } from "~/server/api/routers/onboarding";
import { integrationsRouter } from "~/server/api/routers/integrations";
import { organizationRouter } from "~/server/api/routers/organization";
import { chatV2Router } from "~/server/api/routers/chat-v2";
import { youtubeRouter } from "~/server/api/routers/youtube";
import { instagramRouter } from "~/server/api/routers/instagram";
import { resourcesRouter } from "~/server/api/routers/resources";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  admin: adminRouter,
  onboarding: onboardingRouter,
  integrations: integrationsRouter,
  organization: organizationRouter,
  chatV2: chatV2Router,
  youtube: youtubeRouter,
  instagram: instagramRouter,
  resources: resourcesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
