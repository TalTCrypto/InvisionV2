"use client";

import { useClarityTag } from "~/hooks/use-clarity";
import { api } from "~/trpc/react";

export function ClarityIntegrationsTracking() {
  const { data: integrations } = api.integrations.getConnected.useQuery();

  const connectedIntegrations =
    integrations && Array.isArray(integrations) && integrations.length > 0
      ? integrations.join(",")
      : "none";

  const integrationCount =
    integrations && Array.isArray(integrations) ? integrations.length : 0;

  useClarityTag("integrations_connected", connectedIntegrations);
  useClarityTag("integrations_count", integrationCount.toString());

  return null;
}
