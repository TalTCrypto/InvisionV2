import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";

import { IntegrationsGrid } from "~/components/dashboard/integrations-grid";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Vue d{"'"}ensemble de vos intégrations actives
        </p>
      </div>

      <IntegrationsGrid />
    </div>
  );
}
