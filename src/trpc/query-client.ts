import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Cache plus agressif pour améliorer les performances
        staleTime: 1000 * 60 * 2, // 2 minutes par défaut
        gcTime: 1000 * 60 * 30, // 30 minutes (ancien cacheTime)
        refetchOnWindowFocus: false, // Ne pas refetch au focus
        refetchOnReconnect: true, // Refetch à la reconnexion
        retry: 1, // Une seule tentative en cas d'erreur
        refetchOnMount: false, // Ne pas refetch au mount si les données sont fraîches
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
