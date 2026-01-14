"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Mail, Lock, ArrowRight } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ShimmerButton } from "~/components/ui/shimmer-button";
import { Particles } from "~/components/ui/particles";
import { BlurFade } from "~/components/ui/blur-fade";
import { AnimatedGradientText } from "~/components/ui/animated-gradient-text";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vérifier le statut d'onboarding pour la redirection
  const { data: onboardingStatus } = api.onboarding.getStatus.useQuery();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Erreur de connexion");
      } else {
        // Attendre que le statut d'onboarding soit chargé, sinon rediriger vers onboarding par défaut
        const redirectTo = onboardingStatus?.completed
          ? "/dashboard"
          : "/onboarding";
        router.push(redirectTo);
        router.refresh();
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-background relative min-h-screen">
      {/* Particles Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <Particles
          className="absolute inset-0"
          quantity={30}
          ease={80}
          color="#ffffff"
          size={0.3}
        />
      </div>

      {/* Navigation */}
      <header className="border-border/40 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
              <Bot className="size-5" />
            </div>
            <span className="text-lg font-bold">InVision</span>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-sm">
              Retour
            </Button>
          </Link>
        </nav>
      </header>

      <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 sm:py-16 md:py-20">
        <div className="container mx-auto max-w-md">
          <BlurFade delay={0.1}>
            <div className="mb-10 text-center sm:mb-12">
              <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                Accéder à votre{" "}
                <AnimatedGradientText
                  speed={1.5}
                  colorFrom="#9E7AFF"
                  colorTo="#FE8BBB"
                  className="text-3xl sm:text-4xl md:text-5xl"
                >
                  Second Cerveau
                </AnimatedGradientText>
              </h1>
              <p className="text-muted-foreground text-base sm:text-lg">
                Connectez-vous à votre espace privé InVision
              </p>
            </div>
          </BlurFade>

          <BlurFade delay={0.2}>
            <div className="border-border bg-background rounded-lg border p-8 shadow-sm sm:p-10">
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
                    {error}
                  </div>
                )}

                <div className="space-y-3">
                  <label htmlFor="email" className="block text-sm font-medium">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="text-muted-foreground absolute top-1/2 left-3 size-5 -translate-y-1/2" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="votre@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 pl-11 text-base"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium"
                  >
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="text-muted-foreground absolute top-1/2 left-3 size-5 -translate-y-1/2" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 pl-11 text-base"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <ShimmerButton
                    type="submit"
                    disabled={isLoading}
                    className="h-11 w-full text-base"
                  >
                    {isLoading ? "Connexion..." : "Se connecter"}
                    {!isLoading && <ArrowRight className="ml-2 size-4" />}
                  </ShimmerButton>
                </div>
              </form>

              <div className="border-border mt-8 border-t pt-6">
                <p className="text-muted-foreground text-center text-sm">
                  Vous n{"'"}avez pas encore accès ?{" "}
                  <a
                    href="https://t.me/ThomasAgentic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-medium hover:underline"
                  >
                    Contactez-nous
                  </a>
                </p>
              </div>
            </div>
          </BlurFade>
        </div>
      </main>
    </div>
  );
}
