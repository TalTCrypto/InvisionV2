"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Sparkles,
  Rocket,
  Target,
  Check,
  Brain,
  TrendingUp,
  ArrowLeft,
  User,
  Zap,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ShimmerButton } from "~/components/ui/shimmer-button";
import { BlurFade } from "~/components/ui/blur-fade";
import { AnimatedGradientText } from "~/components/ui/animated-gradient-text";
import { Particles } from "~/components/ui/particles";
import { Textarea } from "~/components/ui/textarea";
import { AnimatedCard } from "~/components/ui/animated-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";

const STEPS = [
  {
    key: "welcome",
    title: "Bienvenue",
    description: "Découvrez InVision",
    icon: Rocket,
  },
  {
    key: "organization",
    title: "Organisation",
    description: "Créez votre espace",
    icon: Sparkles,
  },
  {
    key: "avatar",
    title: "Avatar Client",
    description: "Votre profil et offres",
    icon: User,
  },
  {
    key: "context",
    title: "Votre Contexte",
    description: "Comprendre votre business",
    icon: Brain,
  },
  {
    key: "priorities",
    title: "Vos Priorités",
    description: "Ce qui compte vraiment",
    icon: Target,
  },
  { key: "final", title: "Prêt", description: "C'est parti !", icon: Check },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  // Stocker les données localement jusqu'à la fin
  const [onboardingData, setOnboardingData] = useState<{
    organization?: { name: string; metadata?: Record<string, unknown> };
    avatar?: Record<string, unknown>;
    context?: Record<string, unknown>;
    priorities?: Record<string, unknown>;
  }>({});

  const { data: status, isLoading } = api.onboarding.getStatus.useQuery();

  const completeOnboarding = api.onboarding.completeOnboarding.useMutation({
    onSuccess: () => {
      startTransition(() => {
        router.push("/onboarding/integrations");
        router.refresh();
      });
    },
  });

  // Rediriger si pas connecté ou si l'onboarding est déjà complété
  useEffect(() => {
    if (isLoading) return; // En attente du chargement

    if (status?.completed) {
      startTransition(() => {
        router.push("/dashboard");
      });
    }
  }, [status, isLoading, router, startTransition]);

  // Calculer la progression basée sur l'étape actuelle
  useEffect(() => {
    const progressValue = (currentStep / (STEPS.length - 1)) * 100;
    setProgress(progressValue);
  }, [currentStep]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep onComplete={() => setCurrentStep(1)} />;
      case 1:
        return (
          <OrganizationStep
            initialData={onboardingData.organization}
            onComplete={(data) => {
              setOnboardingData((prev) => ({
                ...prev,
                organization: {
                  name: data.name as string,
                },
              }));
              setCurrentStep(2);
            }}
          />
        );
      case 2:
        return (
          <AvatarStep
            initialData={onboardingData.avatar}
            onComplete={(data) => {
              setOnboardingData((prev) => ({
                ...prev,
                avatar: data,
              }));
              setCurrentStep(3);
            }}
          />
        );
      case 3:
        return (
          <ContextStep
            initialData={onboardingData.context}
            onComplete={(data) => {
              setOnboardingData((prev) => ({
                ...prev,
                context: data,
              }));
              setCurrentStep(4);
            }}
          />
        );
      case 4:
        return (
          <PrioritiesStep
            initialData={onboardingData.priorities}
            onComplete={(data) => {
              setOnboardingData((prev) => ({
                ...prev,
                priorities: data,
              }));
              setCurrentStep(5);
            }}
          />
        );
      case 5:
        return (
          <FinalStep
            onComplete={() => {
              if (onboardingData.organization?.name) {
                completeOnboarding.mutate({
                  organization: {
                    name: onboardingData.organization.name,
                    metadata: {
                      ...onboardingData.avatar,
                      ...onboardingData.context,
                      ...onboardingData.priorities,
                    },
                  },
                });
              }
            }}
          />
        );
      default:
        return null;
    }
  };

  // Afficher un loader pendant le chargement ou la redirection
  if (isLoading || isPending || status?.completed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="border-primary mx-auto size-8 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="text-muted-foreground mt-4">
            {status?.completed ? "Redirection..." : "Chargement..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background relative min-h-screen">
      {/* Particles Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <Particles className="absolute inset-0" quantity={50} />
      </div>

      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Button */}
        {currentStep > 0 && (
          <BlurFade delay={0.05}>
            <div className="mb-6">
              <Button
                variant="ghost"
                onClick={() => setCurrentStep(currentStep - 1)}
                className="gap-2"
              >
                <ArrowLeft className="size-4" />
                Retour
              </Button>
            </div>
          </BlurFade>
        )}

        {/* Progress Bar */}
        <BlurFade delay={0.1}>
          <div className="mb-8">
            <div className="text-muted-foreground mb-2 flex items-center justify-between text-sm">
              <span>Progression</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </BlurFade>

        {/* Steps Indicator */}
        <BlurFade delay={0.2}>
          <div className="mb-8">
            <div className="flex items-center justify-between gap-2">
              {STEPS.map((step, index) => {
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;
                const Icon = step.icon;

                return (
                  <div key={step.key} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex size-10 items-center justify-center rounded-full border-2 transition-all ${
                          isCompleted
                            ? "border-primary bg-primary text-primary-foreground"
                            : isCurrent
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-muted bg-muted text-muted-foreground"
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="size-5" />
                        ) : (
                          <Icon className="size-5" />
                        )}
                      </div>
                      <div className="mt-2 text-center">
                        <div
                          className={`text-xs font-medium ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {step.title}
                        </div>
                      </div>
                    </div>
                    {index < STEPS.length - 1 && (
                      <div
                        className={`mx-1 h-0.5 flex-1 transition-all ${
                          isCompleted ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </BlurFade>

        {/* Step Content */}
        <BlurFade delay={0.3}>
          <div className="mx-auto max-w-3xl">{renderStep()}</div>
        </BlurFade>
      </div>
    </div>
  );
}

// Welcome Step - Montrer la valeur immédiatement
function WelcomeStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="space-y-8 text-center">
      {/* Hero Icon avec effet glow */}
      <BlurFade delay={0.1}>
        <div className="relative mx-auto flex size-32 items-center justify-center">
          <div className="bg-primary/20 absolute inset-0 rounded-full blur-2xl" />
          <div className="from-primary/20 via-primary/10 relative flex size-32 items-center justify-center rounded-full bg-gradient-to-br to-transparent backdrop-blur-sm">
            <Brain className="text-primary size-16 drop-shadow-lg" />
          </div>
        </div>
      </BlurFade>

      {/* Titre et description */}
      <BlurFade delay={0.2}>
        <div className="space-y-4">
          <AnimatedGradientText className="text-3xl leading-tight font-bold sm:text-4xl lg:text-5xl">
            Votre Second Cerveau Business
          </AnimatedGradientText>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-relaxed sm:text-xl">
            InVision analyse{" "}
            <span className="text-foreground font-semibold">VOS données</span>,
            comprend{" "}
            <span className="text-foreground font-semibold">
              VOTRE contexte
            </span>
            , et vous donne des conseils business{" "}
            <span className="text-foreground font-semibold">personnalisés</span>
          </p>
        </div>
      </BlurFade>

      {/* Features Cards */}
      <BlurFade delay={0.3}>
        <div className="grid gap-4 sm:grid-cols-3">
          <AnimatedCard className="group text-center transition-all duration-300 hover:scale-105">
            <div className="space-y-3 p-5">
              <Brain className="text-primary mx-auto size-7 transition-transform duration-300 group-hover:scale-110" />
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold">IA Contextuelle</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Comprend votre business, pas des réponses génériques
                </p>
              </div>
            </div>
          </AnimatedCard>
          <AnimatedCard className="group text-center transition-all duration-300 hover:scale-105">
            <div className="space-y-3 p-5">
              <TrendingUp className="text-primary mx-auto size-7 transition-transform duration-300 group-hover:scale-110" />
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold">
                  Décisions Data-Driven
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Analyse vos métriques et vous conseille en temps réel
                </p>
              </div>
            </div>
          </AnimatedCard>
          <AnimatedCard className="group text-center transition-all duration-300 hover:scale-105">
            <div className="space-y-3 p-5">
              <Zap className="text-primary mx-auto size-7 transition-transform duration-300 group-hover:scale-110" />
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold">100% Privé</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Vos données restent entre vos mains, toujours
                </p>
              </div>
            </div>
          </AnimatedCard>
        </div>
      </BlurFade>

      {/* CTA Button */}
      <BlurFade delay={0.4}>
        <div className="pt-6">
          <ShimmerButton
            onClick={onComplete}
            className="w-full px-6 py-4 text-base font-semibold sm:w-auto"
          >
            Configurer mon second cerveau
          </ShimmerButton>
        </div>
      </BlurFade>
    </div>
  );
}

// Organization Step - Simplifié
function OrganizationStep({
  initialData,
  onComplete,
}: {
  initialData?: { name?: string };
  onComplete: (data: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initialData?.name ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onComplete({ name });
  };

  return (
    <AnimatedCard>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Créez votre espace</h2>
          <p className="text-muted-foreground mt-2">
            Le nom de votre organisation (l{"'"}identifiant sera généré
            automatiquement)
          </p>
        </div>
        <div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mon Entreprise"
            required
            className="h-12 text-lg"
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={!name} size="lg">
            Continuer
          </Button>
        </div>
      </form>
    </AnimatedCard>
  );
}

// Context Step - Questions intelligentes qui montrent la valeur
function ContextStep({
  initialData,
  onComplete,
}: {
  initialData?: Record<string, unknown>;
  onComplete: (data: Record<string, unknown>) => void;
}) {
  const [businessDescription, setBusinessDescription] = useState(
    (initialData?.businessDescription as string) ?? "",
  );
  const [currentChallenge, setCurrentChallenge] = useState(
    (initialData?.currentChallenge as string) ?? "",
  );
  const [keyMetrics, setKeyMetrics] = useState(
    (initialData?.keyMetrics as string) ?? "",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      businessDescription,
      currentChallenge,
      keyMetrics,
    });
  };

  return (
    <AnimatedCard>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Parlez-nous de votre business</h2>
          <p className="text-muted-foreground mt-2">
            Ces informations permettent à InVision de comprendre VOTRE contexte
            unique et de vous donner des conseils vraiment pertinents
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label
              htmlFor="businessDescription"
              className="mb-2 block text-sm font-medium"
            >
              Décrivez votre business en quelques phrases
            </label>
            <Textarea
              id="businessDescription"
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              placeholder="Ex: Je suis solopreneur dans l'e-commerce, je vends des produits fitness en ligne. Je gère une équipe de 5 personnes aux Philippines pour le support client et la logistique. Mon CA mensuel est d'environ 50k€..."
              className="min-h-[120px]"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Plus vous êtes précis, plus InVision pourra vous conseiller
              efficacement
            </p>
          </div>

          <div>
            <label
              htmlFor="currentChallenge"
              className="mb-2 block text-sm font-medium"
            >
              Quel est votre plus grand défi business actuellement ?
            </label>
            <Textarea
              id="currentChallenge"
              value={currentChallenge}
              onChange={(e) => setCurrentChallenge(e.target.value)}
              placeholder="Ex: Je ne sais pas si je dois investir dans le marketing ou améliorer mon produit. Mes métriques sont dispersées entre plusieurs outils..."
              className="min-h-[100px]"
            />
          </div>

          <div>
            <label
              htmlFor="keyMetrics"
              className="mb-2 block text-sm font-medium"
            >
              Quelles sont vos 3 métriques les plus importantes à suivre ?
            </label>
            <Input
              id="keyMetrics"
              value={keyMetrics}
              onChange={(e) => setKeyMetrics(e.target.value)}
              placeholder="Ex: CA mensuel, Taux de conversion, Coût d'acquisition client..."
            />
            <p className="text-muted-foreground mt-1 text-xs">
              InVision utilisera ces métriques pour personnaliser ses analyses
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="submit" size="lg">
            Continuer
          </Button>
        </div>
      </form>
    </AnimatedCard>
  );
}

// Priorities Step - Questions qui montrent l'intelligence du système
function PrioritiesStep({
  initialData,
  onComplete,
}: {
  initialData?: Record<string, unknown>;
  onComplete: (data: Record<string, unknown>) => void;
}) {
  const [mainGoal, setMainGoal] = useState(
    (initialData?.mainGoal as string) ?? "",
  );
  const [decisionContext, setDecisionContext] = useState(
    (initialData?.decisionContext as string) ?? "",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      mainGoal,
      decisionContext,
    });
  };

  return (
    <AnimatedCard>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Vos priorités business</h2>
          <p className="text-muted-foreground mt-2">
            Aidez InVision à comprendre ce qui compte vraiment pour vous
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label
              htmlFor="mainGoal"
              className="mb-2 block text-sm font-medium"
            >
              Quel est votre objectif principal pour les 3 prochains mois ?
            </label>
            <Textarea
              id="mainGoal"
              value={mainGoal}
              onChange={(e) => setMainGoal(e.target.value)}
              placeholder="Ex: Augmenter mon CA de 30% en automatisant mes ventes, ou recruter 2 personnes pour déléguer..."
              className="min-h-[100px]"
            />
          </div>

          <div>
            <label
              htmlFor="decisionContext"
              className="mb-2 block text-sm font-medium"
            >
              Décrivez une décision business récente que vous avez dû prendre
              (et comment vous l{"'"}avez prise)
            </label>
            <Textarea
              id="decisionContext"
              value={decisionContext}
              onChange={(e) => setDecisionContext(e.target.value)}
              placeholder="Ex: J'ai dû choisir entre investir dans Facebook Ads ou améliorer mon site. J'ai regardé mes données mais c'était difficile de trancher..."
              className="min-h-[100px]"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Cela aide InVision à comprendre votre processus de décision actuel
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="submit" size="lg" disabled={!mainGoal}>
            Continuer
          </Button>
        </div>
      </form>
    </AnimatedCard>
  );
}

// Avatar Step - Profil client et offres
function AvatarStep({
  initialData,
  onComplete,
}: {
  initialData?: Record<string, unknown>;
  onComplete: (data: Record<string, unknown>) => void;
}) {
  const [businessType, setBusinessType] = useState(
    (initialData?.businessType as string) ?? "",
  );
  const [offerAngle, setOfferAngle] = useState(
    (initialData?.offerAngle as string) ?? "",
  );
  const [whatYouOffer, setWhatYouOffer] = useState(
    (initialData?.whatYouOffer as string) ?? "",
  );
  const [targetAudience, setTargetAudience] = useState(
    (initialData?.targetAudience as string) ?? "",
  );

  const businessTypeOptions = [
    "E-commerce / Vente en ligne",
    "Services / Consulting",
    "Info-produits / Formation",
    "SaaS / Logiciel",
    "Affiliation / Marketing",
    "Autre",
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      businessType,
      offerAngle,
      whatYouOffer,
      targetAudience,
    });
  };

  return (
    <AnimatedCard>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Votre profil et vos offres</h2>
          <p className="text-muted-foreground mt-2">
            Aidez InVision à comprendre votre positionnement et ce que vous
            proposez à vos clients
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label
              htmlFor="businessType"
              className="mb-2 block text-sm font-medium"
            >
              Type de business <span className="text-destructive">*</span>
            </label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionnez votre type de business" />
              </SelectTrigger>
              <SelectContent>
                {businessTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label
              htmlFor="offerAngle"
              className="mb-2 block text-sm font-medium"
            >
              Quel est l{"'"}angle principal de vos offres ?{" "}
              <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="offerAngle"
              value={offerAngle}
              onChange={(e) => setOfferAngle(e.target.value)}
              placeholder="Ex: Je me positionne sur la transformation personnelle et le développement de compétences business. Mes offres sont orientées résultats concrets et accompagnement personnalisé..."
              className="min-h-[100px]"
              required
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Comment vous positionnez-vous ? Quel est votre angle de vente
              principal ?
            </p>
          </div>

          <div>
            <label
              htmlFor="whatYouOffer"
              className="mb-2 block text-sm font-medium"
            >
              Que proposez-vous exactement ?{" "}
              <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="whatYouOffer"
              value={whatYouOffer}
              onChange={(e) => setWhatYouOffer(e.target.value)}
              placeholder="Ex: Je propose des formations en ligne sur le marketing digital, un programme de coaching 1-to-1 pour entrepreneurs, et des templates Notion pour organiser leur business..."
              className="min-h-[120px]"
              required
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Décrivez vos produits, services, formations, ou autres offres
              principales
            </p>
          </div>

          <div>
            <label
              htmlFor="targetAudience"
              className="mb-2 block text-sm font-medium"
            >
              À qui vous adressez-vous ?{" "}
              <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="targetAudience"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Ex: Entrepreneurs solopreneurs qui génèrent entre 15k et 100k€/mois, qui veulent scaler leur business sans perdre leur liberté. Ils sont souvent dans l'e-commerce, le coaching, ou les services digitaux..."
              className="min-h-[100px]"
              required
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Décrivez votre client idéal : qui sont-ils, quel est leur profil,
              leurs besoins ?
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            size="lg"
            disabled={
              !businessType || !offerAngle || !whatYouOffer || !targetAudience
            }
          >
            Continuer
          </Button>
        </div>
      </form>
    </AnimatedCard>
  );
}

// Final Step - Montrer ce qui va se passer
function FinalStep({ onComplete }: { onComplete: () => void }) {
  return (
    <AnimatedCard>
      <div className="space-y-6 text-center">
        <div className="bg-primary/10 mx-auto flex size-20 items-center justify-center rounded-full">
          <CheckCircle2 className="text-primary size-10" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">
            Votre second cerveau est prêt !
          </h2>
          <p className="text-muted-foreground mt-2">
            InVision va maintenant analyser votre contexte et vous proposer des
            insights personnalisés
          </p>
        </div>

        <div className="space-y-4 text-left">
          <div className="flex items-start gap-3">
            <Brain className="text-primary mt-0.5 size-5 shrink-0" />
            <div>
              <div className="font-semibold">Analyse en cours</div>
              <div className="text-muted-foreground text-sm">
                InVision comprend votre business et prépare des recommandations
                personnalisées
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <TrendingUp className="text-primary mt-0.5 size-5 shrink-0" />
            <div>
              <div className="font-semibold">Prêt à vous conseiller</div>
              <div className="text-muted-foreground text-sm">
                Posez-lui des questions business, il répondra avec VOTRE
                contexte en tête
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-primary mt-0.5 size-5 shrink-0" />
            <div>
              <div className="font-semibold">Données centralisées</div>
              <div className="text-muted-foreground text-sm">
                Toutes vos métriques et données seront analysées en temps réel
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <ShimmerButton onClick={onComplete} className="w-full sm:w-auto">
            Accéder à mon dashboard
          </ShimmerButton>
        </div>
      </div>
    </AnimatedCard>
  );
}
