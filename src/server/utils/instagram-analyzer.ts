/**
 * Instagram Reel Analyzer - Ultra-Actionable Edition
 * 4-step AI analysis optimized for short-form content (<90s)
 * Focus: Hook (0-3s), Retention, Viral Potential, Quick Wins
 */

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { TranscriptSegment } from "./youtube-transcript";

export interface ContentFormat {
  primary:
    | "talk"
    | "news"
    | "tutorial"
    | "storytelling"
    | "pov"
    | "product"
    | "bts"
    | "montage";
  confidence: number;
  characteristics: string[];
  expectedHookStyle: string;
}

export interface PsychologicalTrigger {
  type:
    | "curiosity"
    | "dopamine"
    | "fomo"
    | "emotion"
    | "identity"
    | "authority"
    | "contrast"
    | "controversy"
    | "nostalgia"
    | "social_proof";
  strength: number;
  mechanism: string;
  brainArea: string;
  example: string;
}

export interface HookAnalysis {
  score: number;
  verdict: "viral" | "excellent" | "bon" | "moyen" | "faible";
  contentFormat: ContentFormat;
  psychologicalTriggers: PsychologicalTrigger[];
  strengths: string[];
  weaknesses: string[];
  suggestion: string;
  firstWords: string;
  exactQuotes: string[];
  patternUsed:
    | "question"
    | "shock_value"
    | "story"
    | "trending_sound"
    | "visual_hook"
    | "authority"
    | "contrast"
    | "unknown";
  expertDiagnosis: string;
}

export interface RetentionAnalysis {
  overallScore: number;
  predictedHoldRate: string;
  dropPoints: Array<{
    timestamp: string;
    reason: string;
    severity: "critical" | "moderate";
    quote: string;
  }>;
  peakMoments: Array<{
    timestamp: string;
    reason: string;
    quote: string;
  }>;
  pacingVerdict: "trop_lent" | "optimal" | "trop_rapide";
}

export interface ViralPotential {
  score: number;
  verdict: "viral" | "fort" | "moyen" | "faible";
  trendingElements: string[];
  suggestedHashtags: string[];
  contentGaps: string[];
  replicability: number;
  viralFactorsPresent: string[];
  viralFactorsMissing: string[];
}

export interface ActionableInsight {
  priority: "immediate" | "high" | "medium" | "low";
  category: "hook" | "retention" | "viral" | "caption" | "hashtags";
  action: string;
  expectedImpact: string;
  effort: "5min" | "30min" | "2h" | "1day";
  timestamp?: string;
}

export interface ReelAnalysisResult {
  overallScore: number;
  verdict: string;
  summary: string;
  reelDuration: string;
  hookAnalysis: HookAnalysis;
  retention: RetentionAnalysis;
  viralPotential: ViralPotential;
  insights: ActionableInsight[];
  quickWins: string[];
}

export interface ReelContext {
  caption: string;
  username: string;
  transcript: string;
  wordCount: number;
  language: string;
  segments: TranscriptSegment[];
  reelDurationSeconds: number;
}

type StreamCallback = (chunk: string) => void;
type StatusCallback = (status: string, message: string) => void;

const CREATOR_SYSTEM_PROMPT = `Tu es un EXPERT VIRAL de niveau consultant avec 10+ ans d'expérience en psychologie du contenu, neurosciences appliquées et growth hacking Instagram.

EXPERTISE:
- Tu comprends les formats de contenu (Talk, News, Tutorial, POV, etc.) et adaptes tes critères
- Tu maîtrises les déclencheurs psychologiques (curiosité, dopamine, FOMO, émotion, identité, autorité, contraste, controverse, nostalgie, preuve sociale)
- Tu connais les zones cérébrales activées (amygdale = émotion/peur, cortex préfrontal = curiosité/décision, système de récompense = dopamine)
- Tu analyses POURQUOI un Reel fait X vues (pas plus, pas moins) avec une vision holistique
- Tu donnes des insights niveau CEO, pas du ChatGPT générique

RÈGLES ABSOLUES:
1. AUCUNE invention - UNIQUEMENT le transcript réel
2. TOUS les timestamps RÉELS du transcript
3. CITATIONS EXACTES obligatoires pour chaque point
4. DIAGNOSTIC CAUSAL : Explique POURQUOI ça fonctionne/échoue (mécanismes neurologiques, biais cognitifs)
5. INSIGHTS ACTIONNABLES : Actions précises avec exemples concrets
6. CONTEXTE FORMAT : Adapte les critères au type de contenu détecté

APPROCHE:
- Pense comme un consultant expert, pas comme une IA
- Identifie le format de contenu et adapte l'analyse
- Explique les mécanismes psychologiques activés
- Donne le "pourquoi" profond, pas juste le "quoi"
- Compare avec ce qui fonctionne dans ce format
- Fournis 15-20 insights concis mais profonds

Ta mission: Analyse expert-level qu'un CEO paierait 500€.`;

export class InstagramReelAnalyzer {
  private model: ChatOpenAI;

  constructor(apiKey: string) {
    this.model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 4096,
      openAIApiKey: apiKey,
    });
  }

  async analyzeReel(
    context: ReelContext,
    onStream?: StreamCallback,
    onStatus?: StatusCallback,
  ): Promise<ReelAnalysisResult> {
    // Validate context has transcript segments
    if (!context.segments || context.segments.length === 0) {
      throw new Error("Cannot analyze reel: no transcript segments available");
    }

    if (context.wordCount === 0 || context.transcript.trim().length === 0) {
      throw new Error("Cannot analyze reel: transcript is empty");
    }

    onStatus?.("step", "Démarrage de l'analyse ultra-actionnable...");

    // Step 1: Hook Analysis (0-3s)
    onStatus?.("step", "Étape 1/4: Analyse du Hook (0-3s) - CRITIQUE");
    const hookResult = await this.analyzeHook(context, onStream);

    // Step 2: Retention Analysis
    onStatus?.(
      "step",
      "Étape 2/4: Analyse de rétention et points de décrochage",
    );
    const retentionResult = await this.analyzeRetention(context, onStream);

    // Step 3: Viral Potential
    onStatus?.(
      "step",
      "Étape 3/4: Évaluation du potentiel viral et trending elements",
    );
    const viralResult = await this.analyzeViralPotential(context, onStream);

    // Step 4: Compile Final Analysis with Ultra-Actionable Insights
    onStatus?.(
      "step",
      "Étape 4/4: Génération des actions rapides à fort impact",
    );
    const finalResult = await this.compileFinalAnalysis(
      context,
      hookResult,
      retentionResult,
      viralResult,
      onStream,
    );

    onStatus?.("complete", "Analyse terminée - Actions prêtes !");

    return finalResult;
  }

  private async analyzeHook(
    context: ReelContext,
    onStream?: StreamCallback,
  ): Promise<string> {
    const hookDuration = Math.min(3, context.reelDurationSeconds);
    const hookText = this.getTranscriptExcerpt(
      context.segments,
      0,
      hookDuration,
    );

    const formattedDuration = this.formatDuration(context.reelDurationSeconds);

    const prompt = `ANALYSE EXPERT du HOOK - Niveau Consultant Viral

📋 CONTEXTE:
- Durée TOTALE: ${formattedDuration} (${context.reelDurationSeconds}s)
- Hook analysé: 0:00 à 0:0${hookDuration} (${hookDuration} premières secondes)
- Caption: "${context.caption ?? "Aucune"}"
- Créateur: @${context.username}

TRANSCRIPT (timestamps réels):
${hookText}

TRANSCRIPT COMPLET (contexte):
${context.transcript.slice(0, 500)}...

═══════════════════════════════════════════════════════════════

ÉTAPE 1 - DÉTECTION DU FORMAT DE CONTENU:

Analyse le transcript COMPLET + caption et identifie le format principal:
- TALK (face caméra, commentary, call replay, expert qui parle)
- NEWS (actualité, breaking news, info journalistique)
- TUTORIAL (enseignement, how-to, démonstration)
- STORYTELLING (récit, anecdote, narration)
- POV (mise en scène, acting, skits)
- PRODUCT (review, demo produit/service)
- BTS (behind-the-scenes, coulisses, processus)
- MONTAGE (esthétique, b-roll, montage musical)

Pour chaque format, les hooks VALIDES sont différents:
- TALK: Hook "slow" acceptable si autorité/crédibilité établie dès le mot 1
- NEWS: Hook informatif direct (pas besoin de clickbait, juste impact de l'info)
- TUTORIAL: Hook = promesse claire du résultat obtenu
- STORYTELLING: Hook = situation intrigante ou émotion forte
- POV: Hook = setup relatable ou situation absurde
- PRODUCT: Hook = problème résolu ou transformation visible
- BTS: Hook = exclusivité ou révélation surprenante
- MONTAGE: Hook = visuel choc ou audio captivant

═══════════════════════════════════════════════════════════════

ÉTAPE 2 - ANALYSE PSYCHOLOGIQUE PROFONDE:

Identifie TOUS les déclencheurs psychologiques activés dans le hook:

1. CURIOSITÉ GAP (Cortex préfrontal - recherche de solution):
   Force [0-10]: Question ouverte ? Info incomplète ? Pattern interrupt ?
   Exemple: "Ce que personne ne dit sur...", "La vérité cachée derrière..."

2. DOPAMINE HIT (Système de récompense - gratification):
   Force [0-10]: Promesse de bénéfice rapide ? Choc visuel ? Surprise ?
   Exemple: "En 3 secondes tu vas...", "Regarde ce qui se passe quand..."

3. FOMO (Amygdale - peur de la perte):
   Force [0-10]: Exclusivité ? Urgence ? "Tu vas rater quelque chose" ?
   Exemple: "Seuls 1% savent...", "Avant qu'il soit trop tard..."

4. ÉMOTION FORTE (Amygdale - réaction immédiate):
   Force [0-10]: Colère, peur, joie, tristesse, injustice, scandale ?
   Exemple: "Personne ne parle de cette arnaque...", "J'étais choqué..."

5. IDENTITÉ SOCIALE (Cortex temporal - appartenance):
   Force [0-10]: Groupe cible ? Statut ? "Si tu es X, alors..." ?
   Exemple: "Si tu es entrepreneur, tu dois...", "Les gens qui réussissent..."

6. AUTORITÉ/CRÉDIBILITÉ:
   Force [0-10]: Expertise ? Preuve sociale ? Vécu personnel ?
   Exemple: "Après 10 ans dans...", "J'ai généré 1M€ et voici..."

7. CONTRASTE (Pattern interrupt):
   Force [0-10]: Opposition inattendue ? Avant/après ? Paradoxe ?
   Exemple: "Tout le monde dit X, mais en fait...", "Le riche vs le pauvre..."

8. CONTROVERSE (Engagement émotionnel):
   Force [0-10]: Opinion polarisante ? Sujet tabou ? Provocation ?
   Exemple: "Impôts = vol légal", "Pourquoi je déteste..."

9. NOSTALGIE (Connexion émotionnelle):
   Force [0-10]: Référence au passé ? Souvenir collectif ? "Tu te souviens..." ?
   Exemple: "En 2015, tout était différent...", "Quand j'étais gamin..."

10. PREUVE SOCIALE (Validation collective):
    Force [0-10]: Stats ? Témoignages ? "3M de personnes..." ?
    Exemple: "95% des gens ignorent...", "Viral sur TikTok..."

Pour CHAQUE déclencheur activé (force > 3/10):
- Identifie la CITATION EXACTE qui l'active
- Explique le MÉCANISME neurologique (quelle zone, pourquoi)
- Évalue l'IMPACT sur la rétention (boost estimé)

═══════════════════════════════════════════════════════════════

ÉTAPE 3 - COHÉRENCE FORMAT vs HOOK:

Ce hook est-il adapté au FORMAT détecté ?
- Si TALK/NEWS: Hook lent acceptable SI autorité immédiate
- Si TUTORIAL: Hook doit promettre résultat clair
- Si POV/STORY: Hook doit créer curiosité narrative
- Si PRODUCT: Hook doit montrer transformation

Écart par rapport aux conventions du format: [liste les différences]

═══════════════════════════════════════════════════════════════

ÉTAPE 4 - DIAGNOSTIC EXPERT (3-4 phrases):

Explique en profondeur:
1. Ce qui fonctionne NEUROLOGIQUEMENT (quels mécanismes activés, pourquoi efficace)
2. Ce qui BLOQUE la viralité (quel déclencheur manquant, quelle friction)
3. POURQUOI ce hook génère X engagement et pas plus (analyse causale)
4. Quelle optimisation aurait le + GROS IMPACT (avec exemple concret et explication psychologique)

═══════════════════════════════════════════════════════════════

Format JSON COMPLET:
{
  "score": number,
  "verdict": "viral"|"excellent"|"bon"|"moyen"|"faible",
  "contentFormat": {
    "primary": "talk"|"news"|"tutorial"|"storytelling"|"pov"|"product"|"bts"|"montage",
    "confidence": number (0-100),
    "characteristics": ["caractéristique 1", "caractéristique 2", ...],
    "expectedHookStyle": "Description du hook attendu pour ce format"
  },
  "psychologicalTriggers": [
    {
      "type": "curiosity"|"dopamine"|"fomo"|"emotion"|"identity"|"authority"|"contrast"|"controversy"|"nostalgia"|"social_proof",
      "strength": number (0-10),
      "mechanism": "Explication du mécanisme neurologique",
      "brainArea": "Zone cérébrale activée (amygdale/cortex préfrontal/système de récompense)",
      "example": "Citation EXACTE du transcript qui active ce déclencheur"
    }
  ],
  "patternUsed": "question"|"shock_value"|"story"|"trending_sound"|"visual_hook"|"authority"|"contrast"|"unknown",
  "strengths": ["Force 1 avec citation: 'exacte'", ...],
  "weaknesses": ["Faiblesse 1 avec citation: 'exacte'", ...],
  "suggestion": "Hook alternatif ULTRA-VIRAL avec explication psychologique: 'Exemple...' (Active X + Y déclencheurs)",
  "firstWords": "5-10 premiers mots exacts",
  "exactQuotes": ["citation 1", "citation 2", "citation 3"],
  "expertDiagnosis": "3-4 phrases de diagnostic expert avec analyse causale profonde et mécanismes neurologiques"
}`;

    const response = await this.model.invoke([
      new SystemMessage(CREATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    const result =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    onStream?.(result);
    return result;
  }

  private async analyzeRetention(
    context: ReelContext,
    onStream?: StreamCallback,
  ): Promise<string> {
    const formattedDuration = this.formatDuration(context.reelDurationSeconds);

    const prompt = `Analyse la RÉTENTION de ce Reel Instagram.

⚠️ CONTRAINTES ABSOLUES:
- Durée TOTALE: ${formattedDuration} (${context.reelDurationSeconds} secondes)
- TOUS les timestamps <= ${formattedDuration}
- CITE les passages EXACTS qui causent décrochage/engagement
- Pour les Reels, >2s sans mouvement = problème CRITIQUE

CAPTION: "${context.caption ?? "Aucune caption"}"

TRANSCRIPT COMPLET (avec timestamps):
${this.formatTranscriptWithTimestamps(context.segments)}

Analyse PRÉCISE:

1. SCORE GLOBAL /100 de rétention
2. TAUX DE RÉTENTION PRÉDIT (ex: "65%" = 65% regardent jusqu'au bout)
3. PACING: "trop_lent" (>3s sans punch), "optimal", "trop_rapide" (incompréhensible)
4. POINTS DE DÉCROCHAGE (3-5 max):
   - Timestamp RÉEL
   - Raison précise avec citation
   - Sévérité: "critical" (perte >30%), "moderate" (perte 10-30%)
5. MOMENTS PEAK (2-4 max):
   - Timestamp RÉEL
   - Raison avec citation exacte
   - Pourquoi engageant

Format JSON:
{
  "overallScore": number,
  "predictedHoldRate": "XX%",
  "pacingVerdict": "trop_lent"|"optimal"|"trop_rapide",
  "dropPoints": [
    {
      "timestamp": "0:XX",
      "reason": "Raison précise: 'citation'",
      "severity": "critical"|"moderate",
      "quote": "citation exacte"
    }
  ],
  "peakMoments": [
    {
      "timestamp": "0:XX",
      "reason": "Raison: 'citation'",
      "quote": "citation exacte"
    }
  ]
}`;

    const response = await this.model.invoke([
      new SystemMessage(CREATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    const result =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    onStream?.(result);
    return result;
  }

  private async analyzeViralPotential(
    context: ReelContext,
    onStream?: StreamCallback,
  ): Promise<string> {
    const prompt = `Analyse le POTENTIEL VIRAL de ce Reel Instagram.

CAPTION: "${context.caption ?? "Aucune caption"}"
CRÉATEUR: @${context.username}
DURÉE: ${this.formatDuration(context.reelDurationSeconds)}

TRANSCRIPT:
${context.transcript}

Analyse VIRALE ultra-précise:

1. SCORE VIRAL /100 (sévère - >85 = viral, >70 = fort potentiel)
2. VERDICT: "viral", "fort", "moyen", "faible"
3. TRENDING ELEMENTS présents (sons tendance, challenges, formats viraux)
4. HASHTAGS STRATÉGIQUES recommandés (5-10, mix de tailles):
   - 3-4 gros hashtags (>1M posts) pour découvrabilité
   - 3-4 moyens (100K-1M) pour engagement
   - 2-3 niche (<100K) pour communauté
5. CONTENT GAPS: Ce qui MANQUE pour devenir viral
6. REPLICABILITY /100: Facilité de reproduction (contenu simple = viral)
7. FACTEURS VIRAUX PRÉSENTS (émotion forte, surprise, pratique, relatable, etc.)
8. FACTEURS VIRAUX MANQUANTS

Format JSON:
{
  "score": number,
  "verdict": "viral"|"fort"|"moyen"|"faible",
  "trendingElements": ["Élément 1 identifié", ...],
  "suggestedHashtags": ["#hashtag1", "#hashtag2", ...],
  "contentGaps": ["Manque 1 précis", ...],
  "replicability": number,
  "viralFactorsPresent": ["Facteur 1", ...],
  "viralFactorsMissing": ["Facteur manquant 1", ...]
}`;

    const response = await this.model.invoke([
      new SystemMessage(CREATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    const result =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    onStream?.(result);
    return result;
  }

  private async compileFinalAnalysis(
    context: ReelContext,
    hookResult: string,
    retentionResult: string,
    viralResult: string,
    onStream?: StreamCallback,
  ): Promise<ReelAnalysisResult> {
    const prompt = `COMPILATION FINALE - Analyse Expert CEO-Level

CONTEXTE:
- Durée: ${this.formatDuration(context.reelDurationSeconds)}
- Caption: "${context.caption ?? "Aucune"}"
- Créateur: @${context.username}

RÉSULTATS D'ANALYSE:

HOOK (avec format + psychologie):
${hookResult}

RÉTENTION:
${retentionResult}

VIRAL:
${viralResult}

═══════════════════════════════════════════════════════════════

COMPILATION EXPERT:

1. SCORE GLOBAL /100 - Basé sur: Format × Hook × Retention × Viral

2. VERDICT PERCUTANT (1 phrase):
   Résume POURQUOI ce Reel fait X performance (pas plus, pas moins)
   Inclus le diagnostic causal principal

3. SUMMARY (2-3 paragraphes DENSES):
   - Paragraphe 1: Ce qui FONCTIONNE (déclencheurs activés, mécanismes, citations)
   - Paragraphe 2: Ce qui BLOQUE la viralité (friction principale, déclencheur manquant)
   - Paragraphe 3: Potentiel RÉEL vs actuel (pourquoi X vues et pas Y)

4. INSIGHTS EXPERT (15-20 actions CONCIS mais PROFONDS):

   Chaque insight doit:
   - Être ULTRA-SPÉCIFIQUE avec exemple concret
   - Expliquer le POURQUOI psychologique (mécanisme activé)
   - Donner l'impact CHIFFRÉ estimé
   - Inclure le timestamp si applicable

   Structure par insight:
   {
     "priority": "immediate"|"high"|"medium"|"low",
     "category": "hook"|"retention"|"viral"|"caption"|"hashtags"|"format"|"psychology",
     "action": "Action précise + exemple: 'Remplacer X par Y car active Z déclencheur'",
     "expectedImpact": "+X% [métrique] via activation de [mécanisme psychologique]",
     "effort": "5min"|"30min"|"2h"|"1day",
     "timestamp": "0:XX" (si applicable)
   }

   Couvre TOUS ces aspects:
   - Hook optimization (3-4 insights avec psychologie)
   - Retention fixes (3-4 insights avec timing précis)
   - Viral triggers (3-4 insights avec déclencheurs manquants)
   - Format coherence (2-3 insights adaptation au format)
   - Captions & hashtags (2-3 insights stratégie virale)
   - Quick technical wins (2-3 insights montage/pacing)

   PRIORITÉ: Insights qui ont le + GROS ROI (impact / effort)

5. QUICK WINS (7-10 actions):
   Les gains IMMÉDIATS (<30min) avec impact >10%
   Format: "[Action concrète] → +X% [métrique] (Déclencheur: [nom])"

   Exemples:
   - "Remplacer 'Salut' par 'Arrête de [problème]' → +25% hook retention (Déclencheur: Identité + Curiosité)"
   - "Ajouter cut à 0:08 avant baisse d'énergie → +15% rétention (Évite drop dopamine)"
   - "Hashtag #[niche][année] dans top 3 → +40% découvrabilité (Algorithme boost)"

═══════════════════════════════════════════════════════════════

IMPORTANT:
- NE PAS répéter bêtement les résultats précédents
- SYNTHÉTISER avec vision holistique
- EXPLIQUER les causalités (pourquoi X → Y)
- PRIORISER par ROI réel (pas juste par "importance")
- RESTER CONCRET : exemples, chiffres, timestamps, citations

Format JSON complet:
{
  "overallScore": number,
  "verdict": "phrase percutante en 1 ligne",
  "summary": "2-3 paragraphes avec citations exactes",
  "reelDuration": "${this.formatDuration(context.reelDurationSeconds)}",
  "hookAnalysis": ${hookResult},
  "retention": ${retentionResult},
  "viralPotential": ${viralResult},
  "insights": [
    {
      "priority": "immediate"|"high"|"medium"|"low",
      "category": "hook"|"retention"|"viral"|"caption"|"hashtags",
      "action": "Action ultra-concrète avec exemple",
      "expectedImpact": "Impact chiffré",
      "effort": "5min"|"30min"|"2h"|"1day",
      "timestamp": "0:XX" (optional)
    }
  ],
  "quickWins": [
    "Quick win 1 ultra-concret avec exemple",
    "Quick win 2 ultra-concret avec exemple",
    ...
  ]
}`;

    const response = await this.model.invoke([
      new SystemMessage(CREATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    const result =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    onStream?.(result);

    // Parse and validate JSON
    try {
      const parsed = this.parseAnalysisResponse(result);
      return parsed;
    } catch (error) {
      console.error("Failed to parse final analysis:", error);
      // Return fallback with clear error indicator
      const fallback = this.generateFallbackAnalysis(context);
      fallback.verdict = "⚠️ ERREUR D'ANALYSE - Données partielles uniquement";
      fallback.summary = `Erreur lors de l'analyse automatique: ${error instanceof Error ? error.message : "Erreur inconnue"}. Les résultats ci-dessous sont des valeurs par défaut. Veuillez réessayer l'analyse.`;
      return fallback;
    }
  }

  private parseAnalysisResponse(response: string): ReelAnalysisResult {
    // Extract JSON from response (might be wrapped in markdown code blocks)
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonStr) as ReelAnalysisResult;

    // Validate required fields
    if (
      typeof parsed.overallScore !== "number" ||
      !parsed.verdict ||
      !parsed.hookAnalysis ||
      !parsed.retention ||
      !parsed.viralPotential
    ) {
      throw new Error("Missing required fields in analysis result");
    }

    return parsed;
  }

  private generateFallbackAnalysis(context: ReelContext): ReelAnalysisResult {
    return {
      overallScore: 50,
      verdict: "Analyse partielle - vérifier les détails",
      summary:
        "L'analyse automatique a rencontré une erreur. Résultats partiels disponibles.",
      reelDuration: this.formatDuration(context.reelDurationSeconds),
      hookAnalysis: {
        score: 50,
        verdict: "moyen",
        contentFormat: {
          primary: "talk",
          confidence: 0,
          characteristics: ["Analyse incomplète"],
          expectedHookStyle: "Non déterminé",
        },
        psychologicalTriggers: [],
        strengths: ["Analyse en cours"],
        weaknesses: ["Données incomplètes"],
        suggestion: "Réessayer l'analyse",
        firstWords: context.segments[0]?.text.slice(0, 50) ?? "",
        exactQuotes: [],
        patternUsed: "unknown",
        expertDiagnosis:
          "Erreur d'analyse - impossible de générer le diagnostic expert",
      },
      retention: {
        overallScore: 50,
        predictedHoldRate: "50%",
        dropPoints: [],
        peakMoments: [],
        pacingVerdict: "optimal",
      },
      viralPotential: {
        score: 50,
        verdict: "moyen",
        trendingElements: [],
        suggestedHashtags: [],
        contentGaps: ["Analyse incomplète"],
        replicability: 50,
        viralFactorsPresent: [],
        viralFactorsMissing: [],
      },
      insights: [],
      quickWins: ["Réessayer l'analyse pour obtenir des recommandations"],
    };
  }

  private getTranscriptExcerpt(
    segments: TranscriptSegment[],
    startSeconds: number,
    endSeconds: number,
  ): string {
    const relevant = segments.filter(
      (seg) => seg.start >= startSeconds && seg.start < endSeconds,
    );

    return relevant
      .map((seg) => `[${this.formatDuration(seg.start)}] ${seg.text}`)
      .join("\n");
  }

  private formatTranscriptWithTimestamps(
    segments: TranscriptSegment[],
  ): string {
    return segments
      .map((seg) => `[${this.formatDuration(seg.start)}] ${seg.text}`)
      .join("\n");
  }

  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
}
