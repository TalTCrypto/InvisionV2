import { adminRouter } from "~/server/api/routers/admin";
import { onboardingRouter } from "~/server/api/routers/onboarding";
import { integrationsRouter } from "~/server/api/routers/integrations";
import { organizationRouter } from "~/server/api/routers/organization";
import { postRouter } from "~/server/api/routers/post";
import { chatRouter } from "~/server/api/routers/chat";
import { youtubeRouter } from "~/server/api/routers/youtube";
import { instagramRouter } from "~/server/api/routers/instagram";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  admin: adminRouter,
  onboarding: onboardingRouter,
  integrations: integrationsRouter,
  organization: organizationRouter,
  chat: chatRouter,
  youtube: youtubeRouter,
  instagram: instagramRouter,
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
