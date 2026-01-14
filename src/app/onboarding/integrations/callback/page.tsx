"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "~/components/ui/button";
import { BlurFade } from "~/components/ui/blur-fade";
import { Particles } from "~/components/ui/particles";

export default function IntegrationsCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const error = searchParams.get("error");
  const returnTo = searchParams.get("returnTo") ?? "/onboarding/integrations";

  useEffect(() => {
    // Si la connexion est réussie, rediriger vers la page spécifiée après 2 secondes
    if (status === "success") {
      const timer = setTimeout(() => {
        router.push(returnTo);
        router.refresh();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, router, returnTo]);

  const isSuccess = status === "success";
  const hasError = status === "error" || error;

  return (
    <div className="bg-background relative flex min-h-screen items-center justify-center">
      {/* Particles Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <Particles className="absolute inset-0" quantity={50} />
      </div>

      <BlurFade delay={0.1}>
        <div className="mx-auto max-w-md text-center">
          {isSuccess ? (
            <>
              <div className="bg-primary/10 mx-auto flex size-20 items-center justify-center rounded-full">
                <CheckCircle2 className="text-primary size-10" />
              </div>
              <h1 className="mt-6 text-2xl font-bold">Connexion réussie !</h1>
              <p className="text-muted-foreground mt-2">
                Votre intégration a été connectée avec succès.
              </p>
              <p className="text-muted-foreground mt-4 text-sm">
                Redirection en cours...
              </p>
            </>
          ) : hasError ? (
            <>
              <div className="bg-destructive/10 mx-auto flex size-20 items-center justify-center rounded-full">
                <XCircle className="text-destructive size-10" />
              </div>
              <h1 className="mt-6 text-2xl font-bold">Erreur de connexion</h1>
              <p className="text-muted-foreground mt-2">
                {error ?? "Une erreur est survenue lors de la connexion."}
              </p>
              <Button onClick={() => router.push(returnTo)} className="mt-6">
                Retour aux intégrations
              </Button>
            </>
          ) : (
            <>
              <div className="border-primary mx-auto size-8 animate-spin rounded-full border-4 border-t-transparent" />
              <p className="text-muted-foreground mt-4">
                Traitement en cours...
              </p>
            </>
          )}
        </div>
      </BlurFade>
    </div>
  );
}
