"use client";

import { useClarityIdentify, useClarityTag } from "~/hooks/use-clarity";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";

export function ClarityUserTracking() {
  const { data: session } = authClient.useSession();
  const { data: currentOrg } = api.organization.getCurrentOrganization.useQuery(
    undefined,
    { enabled: !!session?.user },
  );

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  const userName = session?.user?.name ?? undefined;
  const emailVerified = session?.user?.emailVerified ? "yes" : "no";
  const orgId = currentOrg?.id ?? "";
  const orgName = currentOrg?.name ?? "";

  const userAgeDays = session?.user?.createdAt
    ? Math.floor(
        (Date.now() - new Date(session.user.createdAt).getTime()) /
          (1000 * 60 * 60 * 24),
      ).toString()
    : "0";

  useClarityIdentify(userId, userEmail, userName);
  useClarityTag("email_verified", emailVerified);
  useClarityTag("organization_id", orgId);
  useClarityTag("organization_name", orgName);
  useClarityTag("user_age_days", userAgeDays);

  return null;
}
