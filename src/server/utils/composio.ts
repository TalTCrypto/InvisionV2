import { Composio } from "@composio/core";
import { env } from "~/env";

/**
 * Crée une instance Composio avec la clé API configurée
 */
export function getComposioClient() {
  return new Composio({
    apiKey: env.COMPOSIO_API_KEY,
  });
}
