import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { Construction, Sparkles } from "lucide-react";

import { AnimatedCard } from "~/components/ui/animated-card";
import { BackButton } from "~/components/dashboard/back-button";
import { api } from "~/trpc/server";

function normalizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/-/g, "");
}

// Intégrations avec pages détaillées développées
const DEVELOPED_INTEGRATIONS = new Set(["youtube", "instagram"]);

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const { slug } = await params;
  const normalizedSlug = normalizeSlug(slug);

  // Récupérer les informations de l'intégration
  const integrations = await api.integrations.list();
  const integration = integrations.find(
    (int) => normalizeSlug(int.slug) === normalizedSlug,
  );

  if (!integration) {
    redirect("/dashboard/integrations");
  }

  const isDeveloped = DEVELOPED_INTEGRATIONS.has(normalizedSlug);

  if (isDeveloped) {
    // Pour YouTube et Instagram, afficher un message "en cours de développement"
    return (
      <div className="container mx-auto px-6 py-12">
        <BackButton />

        <AnimatedCard className="flex flex-col items-center justify-center p-16 text-center">
          <div className="mb-6 flex items-center justify-center gap-3">
            <Construction className="text-primary size-7" />
            <h1 className="text-4xl font-bold">{integration.name}</h1>
          </div>

          <p className="text-muted-foreground mb-3 text-2xl font-semibold">
            En cours de développement
          </p>
          <p className="text-muted-foreground mb-10 max-w-lg text-base leading-relaxed">
            La page détaillée pour {integration.name} n{"'"}est pas encore
            disponible. Vous pouvez voir les métriques principales sur le
            dashboard.
          </p>

          <div className="border-border/50 bg-muted/30 text-muted-foreground flex items-center gap-2 rounded-lg border px-5 py-3 text-sm">
            <Sparkles className="size-4" />
            <span>Bientôt disponible</span>
          </div>
        </AnimatedCard>
      </div>
    );
  }

  // Pour les autres intégrations, afficher le message "en cours de développement"
  return (
    <div className="container mx-auto px-6 py-12">
      <BackButton />

      <AnimatedCard className="flex flex-col items-center justify-center p-16 text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Sparkles className="text-primary size-7" />
          <h1 className="text-4xl font-bold">{integration.name}</h1>
        </div>

        <p className="text-muted-foreground mb-3 text-2xl font-semibold">
          En cours de développement
        </p>
        <p className="text-muted-foreground mb-10 max-w-lg text-base leading-relaxed">
          L{"'"}intégration {integration.name} est connectée, mais la page
          détaillée n{"'"}est pas encore disponible. Nous travaillons
          activement sur cette fonctionnalité.
        </p>

        <div className="border-border/50 bg-muted/30 text-muted-foreground flex items-center gap-2 rounded-lg border px-5 py-3 text-sm">
          <Construction className="size-4" />
          <span>Bientôt disponible</span>
        </div>
      </AnimatedCard>
    </div>
  );
}
