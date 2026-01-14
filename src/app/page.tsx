import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  Target,
  FileText,
  BarChart3,
  Sparkles,
} from "lucide-react";

import { AnimatedGradientText } from "~/components/ui/animated-gradient-text";
import { Button } from "~/components/ui/button";
import { ShimmerButton } from "~/components/ui/shimmer-button";
import { AnimatedCard } from "~/components/ui/animated-card";
import { Particles } from "~/components/ui/particles";
import { Marquee } from "~/components/ui/marquee";
import { BlurFade } from "~/components/ui/blur-fade";
import { InstagramIcon } from "~/components/ui/svgs/instagramIcon";
import { Youtube } from "~/components/ui/svgs/youtube";
import { Twitter } from "~/components/ui/svgs/twitter";
import { Stripe } from "~/components/ui/svgs/stripe";
import { Linkedin } from "~/components/ui/svgs/linkedin";
import { FacebookIcon } from "~/components/ui/svgs/facebookIcon";
import { Google } from "~/components/ui/svgs/google";
import { Notion } from "~/components/ui/svgs/notion";
import { Slack } from "~/components/ui/svgs/slack";
import { Shopify } from "~/components/ui/svgs/shopify";
import { getSession } from "~/server/better-auth/server";

export default async function Home() {
  const session = await getSession();

  const features = [
    {
      icon: Brain,
      title: "Votre Second Cerveau Business",
      description:
        "Une IA qui comprend votre business mieux que vous. Elle analyse toutes vos plateformes, vos données et vos fichiers pour vous donner les meilleures décisions stratégiques.",
    },
    {
      icon: Target,
      title: "Prise de Décision Intelligente",
      description:
        "L'IA ne se contente pas d'analyser, elle prend des décisions. Elle vous propose des actions concrètes basées sur une compréhension complète de votre business.",
    },
    {
      icon: FileText,
      title: "Personnalisation Totale",
      description:
        "Ajoutez vos fichiers business, vos stratégies, vos objectifs. L'IA apprend qui vous êtes et adapte ses recommandations à votre modèle économique unique.",
    },
    {
      icon: Sparkles,
      title: "Orchestration Multi-Plateformes",
      description:
        "Une IA orchestratrice qui connecte Instagram, YouTube, LinkedIn, Shopify, Stripe et toutes vos plateformes. Elle voit tout, comprend tout, et agit sur tout.",
    },
    {
      icon: BarChart3,
      title: "Analyse Centralisée",
      description:
        "Plus besoin de jongler entre 10 outils différents. Toutes vos analyses sont centralisées et l'IA vous donne une vision claire de ce qui fonctionne vraiment.",
    },
    {
      icon: Bot,
      title: "Actions Automatisées",
      description:
        "L'IA n'est pas juste un assistant, elle agit. Elle peut automatiser des tâches cross-platformes en comprenant le contexte de votre business.",
    },
  ];

  const integrations = [
    { name: "Instagram", Icon: InstagramIcon },
    { name: "YouTube", Icon: Youtube },
    { name: "Twitter", Icon: Twitter },
    { name: "LinkedIn", Icon: Linkedin },
    { name: "Meta Ads", Icon: FacebookIcon },
    { name: "Google Calendar", Icon: Google },
    { name: "Notion", Icon: Notion },
    { name: "Slack", Icon: Slack },
    { name: "Shopify", Icon: Shopify },
    { name: "Stripe", Icon: Stripe },
  ];

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
          <div className="flex items-center gap-2 sm:gap-4">
            {session ? (
              <Link href="/onboarding">
                <Button variant="outline" size="sm" className="text-sm">
                  Mon espace
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/auth/signin">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden text-sm sm:inline-flex"
                  >
                    Se connecter
                  </Button>
                </Link>
                <a
                  href="https://t.me/ThomasAgentic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <ShimmerButton className="px-4 py-2 text-sm whitespace-nowrap sm:px-6 sm:py-2.5">
                    <span className="hidden sm:inline">Nous contacter</span>
                    <span className="sm:hidden">Contact</span>
                  </ShimmerButton>
                </a>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="relative">
        {/* Hero Section */}
        <section className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 sm:py-16 md:py-20 lg:py-24">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-4xl text-center">
              <BlurFade delay={0.1}>
                <div className="border-border bg-muted/50 mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:px-4 sm:text-sm">
                  <span className="relative flex size-2">
                    <span className="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-75" />
                    <span className="bg-primary relative inline-flex size-2 rounded-full" />
                  </span>
                  <span className="hidden sm:inline">
                    Accès privé • Réservé à nos clients
                  </span>
                  <span className="sm:hidden">Accès privé</span>
                </div>
              </BlurFade>

              <BlurFade delay={0.2}>
                <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
                  Votre{" "}
                  <AnimatedGradientText
                    speed={1.5}
                    colorFrom="#9E7AFF"
                    colorTo="#FE8BBB"
                    className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
                  >
                    Second Cerveau
                  </AnimatedGradientText>
                  <br className="hidden sm:block" />
                  Business
                </h1>
              </BlurFade>

              <BlurFade delay={0.3}>
                <p className="text-muted-foreground mx-auto mb-8 max-w-2xl text-base leading-relaxed sm:text-lg md:text-xl">
                  Une IA qui comprend votre business, analyse toutes vos
                  plateformes et prend des décisions stratégiques pour vous.
                  Plus qu{"'"}un outil, c{"'"}est votre partenaire de
                  croissance qui voit ce que vous ne voyez pas.
                </p>
              </BlurFade>

              <BlurFade delay={0.4}>
                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                  {session ? (
                    <Link href="/dashboard" className="w-full sm:w-auto">
                      <ShimmerButton className="w-full px-6 py-3 text-base sm:w-auto sm:px-8 sm:py-3.5 sm:text-lg">
                        Accéder à votre espace
                        <ArrowRight className="ml-2 size-4" />
                      </ShimmerButton>
                    </Link>
                  ) : (
                    <>
                      <a
                        href="https://t.me/ThomasAgentic"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto"
                      >
                        <ShimmerButton className="w-full px-6 py-3 text-base sm:w-auto sm:px-8 sm:py-3.5 sm:text-lg">
                          Demander un accès
                          <ArrowRight className="ml-2 size-4" />
                        </ShimmerButton>
                      </a>
                      <Link href="/auth/signin" className="w-full sm:w-auto">
                        <Button
                          variant="outline"
                          size="lg"
                          className="w-full sm:w-auto"
                        >
                          Se connecter
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </BlurFade>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="border-border bg-muted/20 relative z-10 border-t py-16 sm:py-20 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <BlurFade delay={0.1}>
              <div className="mb-12 text-center sm:mb-16">
                <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                  Pourquoi InVision est différent
                </h2>
                <p className="text-muted-foreground mx-auto max-w-2xl text-base sm:text-lg">
                  Ce n{"'"}est pas juste une IA de plus. C{"'"}est un système
                  qui comprend votre business et prend des décisions
                  stratégiques pour vous faire gagner du temps et de
                  l{"'"}argent.
                </p>
              </div>
            </BlurFade>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <BlurFade key={feature.title} delay={0.1 + index * 0.1}>
                    <AnimatedCard className="h-full" contentClassName="p-6">
                      <div className="bg-primary/10 mb-4 flex size-12 items-center justify-center rounded-lg">
                        <Icon className="text-primary size-6" />
                      </div>
                      <h3 className="mb-2 text-lg font-semibold sm:text-xl">
                        {feature.title}
                      </h3>
                      <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
                        {feature.description}
                      </p>
                    </AnimatedCard>
                  </BlurFade>
                );
              })}
            </div>
          </div>
        </section>

        {/* Integrations Section */}
        <section className="border-border relative z-10 border-t py-16 sm:py-20 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <BlurFade delay={0.1}>
              <div className="mb-12 text-center sm:mb-16">
                <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                  L{"'"}IA a accès à tout
                </h2>
                <p className="text-muted-foreground mx-auto max-w-2xl text-base sm:text-lg">
                  Votre IA voit toutes vos plateformes en temps réel. Elle
                  analyse Instagram, YouTube, Shopify, Stripe, vos emails, votre
                  CRM et bien plus. Une vision complète pour des décisions
                  éclairées.
                </p>
              </div>
            </BlurFade>

            <BlurFade delay={0.2}>
              <div className="border-border bg-muted/30 rounded-2xl border p-6 sm:p-8">
                <Marquee pauseOnHover className="[--duration:20s]">
                  {integrations.map((integration) => {
                    const Icon = integration.Icon;
                    return (
                      <div
                        key={integration.name}
                        className="border-border bg-background mx-2 flex min-w-[140px] flex-col items-center justify-center gap-2 rounded-lg border p-4 shadow-sm sm:mx-4 sm:min-w-[160px] sm:p-6"
                      >
                        <Icon className="text-foreground size-8 sm:size-10" />
                        <span className="text-xs font-medium sm:text-sm">
                          {integration.name}
                        </span>
                      </div>
                    );
                  })}
                </Marquee>
              </div>
            </BlurFade>
          </div>
        </section>

        {/* Comparison Section */}
        <section className="border-border bg-muted/20 relative z-10 border-t py-16 sm:py-20 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <BlurFade delay={0.1}>
              <div className="mb-12 text-center sm:mb-16">
                <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                  InVision vs les autres
                </h2>
                <p className="text-muted-foreground mx-auto max-w-2xl text-base sm:text-lg">
                  La différence entre un outil générique et votre second cerveau
                  business
                </p>
              </div>
            </BlurFade>

            <div className="mx-auto max-w-5xl space-y-6">
              {/* Comparison 1 */}
              <BlurFade delay={0.2}>
                <div className="border-border bg-background overflow-hidden rounded-lg border shadow-sm">
                  <div className="grid gap-0 sm:grid-cols-2">
                    <div className="border-border bg-muted/30 border-r-0 border-b p-6 sm:border-r sm:border-b-0 sm:p-8">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-2xl">❌</span>
                        <h3 className="text-lg font-semibold">
                          ChatGPT & IA génériques
                        </h3>
                      </div>
                      <ul className="text-muted-foreground space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>
                            Réponses génériques qui ne connaissent pas votre
                            business
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>Pas d{"'"}accès à vos données réelles</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>
                            Conseils théoriques, pas de décisions actionnables
                          </span>
                        </li>
                      </ul>
                    </div>
                    <div className="bg-primary/5 p-6 sm:p-8">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-2xl">✅</span>
                        <h3 className="text-primary text-lg font-semibold">
                          InVision
                        </h3>
                      </div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="font-medium">
                            Comprend VOTRE business grâce à vos fichiers et
                            données
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="font-medium">
                            Accès direct à toutes vos plateformes en temps réel
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="font-medium">
                            Prend des décisions stratégiques basées sur votre
                            contexte unique
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </BlurFade>

              {/* Comparison 2 */}
              <BlurFade delay={0.3}>
                <div className="border-border bg-background overflow-hidden rounded-lg border shadow-sm">
                  <div className="grid gap-0 sm:grid-cols-2">
                    <div className="border-border bg-muted/30 border-r-0 border-b p-6 sm:border-r sm:border-b-0 sm:p-8">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-2xl">❌</span>
                        <h3 className="text-lg font-semibold">
                          IA SaaS low cost
                        </h3>
                      </div>
                      <ul className="text-muted-foreground space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>Ne connaît rien à votre modèle économique</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>Configuration complexe, résultats moyens</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>
                            Une IA de plus dans votre stack, pas un partenaire
                          </span>
                        </li>
                      </ul>
                    </div>
                    <div className="bg-primary/5 p-6 sm:p-8">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-2xl">✅</span>
                        <h3 className="text-primary text-lg font-semibold">
                          InVision
                        </h3>
                      </div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="font-medium">
                            Apprend qui vous êtes via vos fichiers business
                            personnalisés
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="font-medium">
                            Pense comme vous, mais en mieux - votre second
                            cerveau
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="font-medium">
                            Connaît votre modèle, vos clients, vos processus
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </BlurFade>

              {/* Comparison 3 */}
              <BlurFade delay={0.4}>
                <div className="border-border bg-background overflow-hidden rounded-lg border shadow-sm">
                  <div className="grid gap-0 sm:grid-cols-2">
                    <div className="border-border bg-muted/30 border-r-0 border-b p-6 sm:border-r sm:border-b-0 sm:p-8">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-2xl">❌</span>
                        <h3 className="text-lg font-semibold">
                          Outils classiques
                        </h3>
                      </div>
                      <ul className="text-muted-foreground space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>Jongler entre 10 plateformes différentes</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>Analyses dispersées, vision fragmentée</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>Pas de coordination entre vos outils</span>
                        </li>
                      </ul>
                    </div>
                    <div className="bg-primary/5 p-6 sm:p-8">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-2xl">✅</span>
                        <h3 className="text-primary text-lg font-semibold">
                          InVision
                        </h3>
                      </div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="font-medium">
                            Une seule IA qui orchestre toutes vos plateformes
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="font-medium">
                            Analyse centralisée - vision claire de ce qui
                            fonctionne
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="font-medium">
                            Actions automatisées cross-platformes intelligentes
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </BlurFade>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-border relative z-10 border-t py-16 sm:py-20 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <BlurFade delay={0.1}>
              <AnimatedCard
                className="mx-auto max-w-4xl"
                contentClassName="p-8 text-center sm:p-12"
              >
                <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
                  Prêt à avoir un second cerveau pour votre business ?
                </h2>
                <p className="text-muted-foreground mb-8 text-base sm:text-lg">
                  InVision n{"'"}est pas accessible au public. C{"'"}est un
                  outil privé réservé à nos clients. Si vous travaillez avec
                  nous, vous avez déjà accès. Sinon, contactez-nous pour en
                  savoir plus.
                </p>
                {session ? (
                  <Link href="/dashboard" className="inline-block">
                    <ShimmerButton className="px-6 py-3 text-base sm:px-8 sm:py-3.5 sm:text-lg">
                      Accéder à votre espace
                      <ArrowRight className="ml-2 size-4" />
                    </ShimmerButton>
                  </Link>
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                    <a
                      href="https://t.me/ThomasAgentic"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      <ShimmerButton className="px-6 py-3 text-base sm:px-8 sm:py-3.5 sm:text-lg">
                        Nous contacter pour un accès
                        <ArrowRight className="ml-2 size-4" />
                      </ShimmerButton>
                    </a>
                    <Link href="/auth/signin" className="inline-block">
                      <Button
                        variant="outline"
                        size="lg"
                        className="px-6 py-3 text-base sm:px-8 sm:py-3.5 sm:text-lg"
                      >
                        Se connecter
                      </Button>
                    </Link>
                  </div>
                )}
              </AnimatedCard>
            </BlurFade>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-border bg-muted/30 relative z-10 border-t py-8 sm:py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Link href="/" className="flex items-center gap-2">
              <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
                <Bot className="size-5" />
              </div>
              <span className="text-lg font-bold">InVision</span>
            </Link>
            <p className="text-muted-foreground text-xs sm:text-sm">
              © {new Date().getFullYear()} InVision. Tous droits réservés.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
