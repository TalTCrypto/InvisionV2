import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export default async function IntegrationsOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Vérifier que l'onboarding principal est complété
  const onboardingStatus = await api.onboarding.getStatus();

  if (!onboardingStatus.completed) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
