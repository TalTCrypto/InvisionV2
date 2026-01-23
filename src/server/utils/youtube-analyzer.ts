/**
 * YouTube Video Analyzer - PRECISION Edition
 * Analyse ultra-précise avec timestamps RÉELS du transcript
 * Multi-step AI analysis avec LangChain
 */

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { TranscriptSegment } from "./youtube-transcript";

export interface HookAnalysis {
  score: number;
  verdict: "excellent" | "bon" | "moyen" | "faible";
  strengths: string[];
  weaknesses: string[];
  suggestion: string;
  firstWords: string;
  exactQuotes: string[];
}

export interface SegmentAnalysis {
  timestamp: string;
  duration: string;
  topic: string;
  engagementScore: number;
  retentionImpact: "boost" | "drop" | "stable";
  strengths: string[];
  improvements: string[];
  keyQuote: string;
}

export interface StructureAnalysis {
  intro: {
    duration: string;
    score: number;
    hasHook: boolean;
    hasPromise: boolean;
    feedback: string;
    quote: string;
  };
  body: {
    segments: SegmentAnalysis[];
    pacing: "trop_lent" | "optimal" | "trop_rapide";
    transitions: number;
  };
  conclusion: {
    duration: string;
    score: number;
    hasCta: boolean;
    ctaType: string;
    ctaStrength: number;
    feedback: string;
    quote: string;
  };
}

export interface RetentionAnalysis {
  overallScore: number;
  predictedAvgViewDuration: string;
  dropPoints: Array<{
    timestamp: string;
    reason: string;
    severity: "critical" | "moderate" | "minor";
    quote: string;
  }>;
  peakMoments: Array<{
    timestamp: string;
    reason: string;
    replicable: boolean;
    quote: string;
  }>;
  benchmarkVsNiche: string;
}

export interface GrowthOpportunities {
  titleAnalysis: {
    current: string;
    score: number;
    issues: string[];
    suggestions: string[];
  };
  thumbnailIdeas: string[];
  seoKeywords: string[];
  contentGaps: string[];
  viralPotential: {
    score: number;
    factors: string[];
    missing: string[];
  };
  monetizationAngles: string[];
}

export interface ActionableInsight {
  priority: "critical" | "high" | "medium" | "low";
  category: "hook" | "retention" | "cta" | "seo" | "content" | "growth";
  action: string;
  expectedImpact: string;
  effort: "facile" | "moyen" | "difficile";
}

export interface AnalysisResult {
  overallScore: number;
  verdict: string;
  summary: string;
  hookAnalysis: HookAnalysis;
  structure: StructureAnalysis;
  retention: RetentionAnalysis;
  growth: GrowthOpportunities;
  insights: ActionableInsight[];
  quickWins: string[];
  keyPoints?: string[];
  topics?: string[];
  targetAudience?: string;
  recommendations?: string[];
  videoDuration: string;
}

export interface VideoContext {
  title: string;
  channel: string;
  transcript: string;
  wordCount: number;
  language: string;
  segments?: TranscriptSegment[];
  videoDurationSeconds?: number;
}

export type StreamCallback = (chunk: string) => void;
export type StatusCallback = (status: string) => void;

/**
 * Format seconds to MM:SS string
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format transcript with REAL timestamps from segments
 */
function formatTranscriptWithTimestamps(segments: TranscriptSegment[]): string {
  const lines: string[] = [];

  for (const segment of segments) {
    const timestamp = formatTimestamp(segment.start);
    lines.push(`[${timestamp}] ${segment.text}`);
  }

  return lines.join("\n");
}

/**
 * Extract segments for a specific time range
 */
function getSegmentsInRange(
  segments: TranscriptSegment[],
  startSeconds: number,
  endSeconds: number,
): TranscriptSegment[] {
  return segments.filter(
    (s) => s.start >= startSeconds && s.start < endSeconds,
  );
}

/**
 * Get text content for a specific time range
 */
function getTextInRange(
  segments: TranscriptSegment[],
  startSeconds: number,
  endSeconds: number,
): string {
  return getSegmentsInRange(segments, startSeconds, endSeconds)
    .map((s) => s.text)
    .join(" ");
}

const CREATOR_SYSTEM_PROMPT = `Tu es un expert en croissance YouTube, spécialisé dans l'analyse de contenu pour les infopreneurs et créateurs de business en ligne.

RÈGLES ABSOLUES DE PRÉCISION:
1. Tu NE PEUX PAS inventer de timestamps - utilise UNIQUEMENT les timestamps fournis dans le transcript
2. Tu DOIS citer des phrases EXACTES du transcript entre guillemets
3. Tu DOIS respecter la durée RÉELLE de la vidéo fournie
4. JAMAIS de timestamps au-delà de la durée totale de la vidéo
5. Chaque analyse doit inclure des CITATIONS DIRECTES du transcript

Tu analyses les vidéos avec une précision CHIRURGICALE pour identifier:
- Pourquoi une vidéo performe ou non
- Les moments exacts qui font décrocher les viewers (avec citations)
- Les opportunités de croissance manquées
- Les leviers actionnables pour améliorer les stats

Ton analyse doit être BRUTALEMENT HONNÊTE, ACTIONNABLE, et BASÉE SUR LE CONTENU RÉEL.`;

export class YouTubeAnalyzer {
  private model: ChatOpenAI;

  constructor(apiKey?: string) {
    this.model = new ChatOpenAI({
      openAIApiKey: apiKey ?? process.env.OPENAI_API_KEY,
      modelName: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 4096,
    });
  }

  async analyze(
    context: VideoContext,
    onStream?: StreamCallback,
  ): Promise<AnalysisResult> {
    return this.analyzeMultiStep(context, onStream);
  }

  async analyzeMultiStep(
    context: VideoContext,
    onStream?: StreamCallback,
    onStatus?: StatusCallback,
  ): Promise<AnalysisResult> {
    const segments = context.segments ?? [];
    const videoDuration =
      context.videoDurationSeconds ?? this.estimateDuration(context.wordCount);
    const formattedDuration = formatTimestamp(videoDuration);

    // Create timestamped transcript if segments are available
    const timestampedTranscript =
      segments.length > 0
        ? formatTranscriptWithTimestamps(segments)
        : context.transcript;

    // Get first 60 seconds for hook analysis (real segments)
    const hookSegments =
      segments.length > 0 ? getSegmentsInRange(segments, 0, 60) : [];
    const hookText =
      segments.length > 0
        ? formatTranscriptWithTimestamps(hookSegments)
        : context.transcript.split(/\s+/).slice(0, 500).join(" ");

    onStatus?.("Étape 1/6: Analyse du Hook (0:00 - 1:00)...");
    const hookResult = await this.analyzeHook(
      hookText,
      context,
      formattedDuration,
      videoDuration,
    );
    onStream?.(`[HOOK ANALYSIS]\n${hookResult}\n\n`);

    onStatus?.("Étape 2/6: Analyse de la structure narrative...");
    const structureResult = await this.analyzeStructure(
      timestampedTranscript,
      context,
      formattedDuration,
      videoDuration,
      segments,
    );
    onStream?.(`[STRUCTURE ANALYSIS]\n${structureResult}\n\n`);

    onStatus?.("Étape 3/6: Scoring des segments et rétention...");
    const retentionResult = await this.analyzeRetention(
      timestampedTranscript,
      context,
      formattedDuration,
      videoDuration,
    );
    onStream?.(`[RETENTION ANALYSIS]\n${retentionResult}\n\n`);

    onStatus?.("Étape 4/6: Opportunités de croissance...");
    const growthResult = await this.analyzeGrowth(
      timestampedTranscript,
      context,
    );
    onStream?.(`[GROWTH OPPORTUNITIES]\n${growthResult}\n\n`);

    onStatus?.("Étape 5/6: Génération des insights actionnables...");
    const insightsResult = await this.generateInsights(
      context,
      hookResult,
      structureResult,
      retentionResult,
      growthResult,
      formattedDuration,
    );
    onStream?.(`[ACTIONABLE INSIGHTS]\n${insightsResult}\n\n`);

    onStatus?.("Étape 6/6: Compilation de l'analyse finale...");
    const finalResult = await this.compileFinalAnalysis(
      context,
      hookResult,
      structureResult,
      retentionResult,
      growthResult,
      insightsResult,
      formattedDuration,
      videoDuration,
    );

    return finalResult;
  }

  private estimateDuration(wordCount: number): number {
    // Average speaking rate: ~150 words per minute
    return Math.ceil((wordCount / 150) * 60);
  }

  private async analyzeHook(
    hookText: string,
    context: VideoContext,
    formattedDuration: string,
    videoDuration: number,
  ): Promise<string> {
    const prompt = `Analyse le HOOK (accroche) de cette vidéo YouTube.

⚠️ CONTRAINTES ABSOLUES:
- Durée TOTALE de la vidéo: ${formattedDuration} (${videoDuration} secondes)
- Tu analyses les 60 PREMIÈRES SECONDES (0:00 à 1:00)
- CITE des phrases EXACTES du transcript entre guillemets
- NE JAMAIS inventer de contenu

TITRE: "${context.title}"
CHAÎNE: ${context.channel}

TRANSCRIPT DES 60 PREMIÈRES SECONDES (avec timestamps réels):
${hookText}

Analyse avec PRÉCISION et CITATIONS:

1. **Force du Hook (0-100)**
   - Est-ce que ça capte IMMÉDIATEMENT l'attention?
   - Y a-t-il une promesse claire dans les 5 premières secondes?
   - CITE la phrase d'accroche exacte

2. **Pattern utilisé** (avec citation)
   - Question provocante? -> CITE la question exacte
   - Statistique choc? -> CITE le chiffre exact
   - Histoire personnelle? -> CITE le début
   - Problème/Solution?
   - Teasing du contenu?

3. **Citations clés** (3-5 phrases exactes du hook, entre guillemets)

4. **Points forts** (avec citations à l'appui)

5. **Points faibles** (avec exemples précis du transcript)

6. **Suggestion d'amélioration** (une phrase d'accroche alternative CONCRÈTE)

7. **Verdict**: excellent / bon / moyen / faible

Sois BRUTAL et PRÉCIS. Chaque affirmation doit être appuyée par une CITATION.`;

    const response = await this.model.invoke([
      new SystemMessage(CREATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    return typeof response.content === "string" ? response.content : "";
  }

  private async analyzeStructure(
    transcript: string,
    context: VideoContext,
    formattedDuration: string,
    videoDuration: number,
    segments: TranscriptSegment[],
  ): Promise<string> {
    // Pre-segment the video into logical parts based on timing
    const introEnd = Math.min(60, videoDuration * 0.1);
    const conclusionStart = videoDuration - Math.min(60, videoDuration * 0.1);

    const prompt = `Analyse la STRUCTURE NARRATIVE de cette vidéo YouTube.

⚠️ CONTRAINTES ABSOLUES:
- Durée TOTALE de la vidéo: ${formattedDuration} (${videoDuration} secondes)
- TOUS les timestamps doivent être entre 0:00 et ${formattedDuration}
- CITE des phrases EXACTES pour chaque segment
- Les timestamps sont RÉELS et proviennent du transcript

TITRE: "${context.title}"

TRANSCRIPT AVEC TIMESTAMPS RÉELS:
${transcript.substring(0, 15000)}

Analyse la structure en 3 parties (RESPECTE LA DURÉE ${formattedDuration}):

## 1. INTRO (0:00 à ~${formatTimestamp(introEnd)})
- Durée exacte basée sur le transcript
- Hook présent? CITE la phrase exacte
- Promesse claire? CITE la phrase exacte
- Score /100
- Feedback avec citations

## 2. CORPS (~${formatTimestamp(introEnd)} à ~${formatTimestamp(conclusionStart)})
Identifie 3-5 segments basés sur les VRAIS timestamps du transcript:

Pour chaque segment:
- Timestamp RÉEL (ex: "${formatTimestamp(introEnd + 30)}-${formatTimestamp(introEnd + 120)}")
- Sujet traité + CITATION clé
- Score d'engagement /100
- Impact rétention (boost/drop/stable)
- Forces et améliorations avec CITATIONS

⚠️ RAPPEL: Max timestamp = ${formattedDuration}

## 3. CONCLUSION (~${formatTimestamp(conclusionStart)} à ${formattedDuration})
- CTA présent? CITE le CTA exact
- Type et force /100
- Feedback avec citations

IMPORTANT: Chaque analyse DOIT inclure une CITATION EXACTE du transcript.`;

    const response = await this.model.invoke([
      new SystemMessage(CREATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    return typeof response.content === "string" ? response.content : "";
  }

  private async analyzeRetention(
    transcript: string,
    context: VideoContext,
    formattedDuration: string,
    videoDuration: number,
  ): Promise<string> {
    const prompt = `Analyse la RÉTENTION potentielle de cette vidéo YouTube.

⚠️ CONTRAINTES ABSOLUES:
- Durée TOTALE de la vidéo: ${formattedDuration} (${videoDuration} secondes)
- TOUS les timestamps entre 0:00 et ${formattedDuration} UNIQUEMENT
- CITE les passages problématiques ou excellents

TITRE: "${context.title}"

TRANSCRIPT AVEC TIMESTAMPS RÉELS:
${transcript.substring(0, 15000)}

## ANALYSE DE RÉTENTION (vidéo de ${formattedDuration})

### 1. Score Global (0-100)

### 2. Points de DÉCROCHAGE (timestamps RÉELS uniquement, max ${formattedDuration})
Pour chaque point:
- Timestamp EXACT du transcript (ex: "2:30")
- CITATION du passage problématique
- Raison du décrochage
- Sévérité: critical / moderate / minor

### 3. PICS D'ENGAGEMENT (timestamps RÉELS)
Pour chaque pic:
- Timestamp EXACT
- CITATION du moment fort
- Pourquoi ça engage
- Reproductible?

### 4. Durée de Visionnage Moyenne Prédite
- Pourcentage
- En format MM:SS (rappel: max = ${formattedDuration})

### 5. Benchmark vs Niche

⚠️ VÉRIFICATION FINALE: As-tu respecté la limite de ${formattedDuration}? Tous les timestamps sont-ils valides?`;

    const response = await this.model.invoke([
      new SystemMessage(CREATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    return typeof response.content === "string" ? response.content : "";
  }

  private async analyzeGrowth(
    transcript: string,
    context: VideoContext,
  ): Promise<string> {
    const prompt = `Analyse les OPPORTUNITÉS DE CROISSANCE pour cette vidéo.

TITRE ACTUEL: "${context.title}"
CHAÎNE: ${context.channel}

TRANSCRIPT (extrait avec timestamps):
${transcript.substring(0, 10000)}

## 1. ANALYSE DU TITRE
- Score /100
- 3 alternatives optimisées CTR

## 2. IDÉES DE THUMBNAIL (basées sur le CONTENU RÉEL)
- 3 concepts avec éléments du contenu

## 3. MOTS-CLÉS SEO (extraits du contenu)
- 5-8 keywords présents dans la vidéo

## 4. GAPS DE CONTENU
- Sujets mentionnés mais pas développés (CITE les passages)
- Questions en suspens

## 5. POTENTIEL VIRAL
- Score /100 avec justification

## 6. ANGLES DE MONÉTISATION
- Basés sur le contenu RÉEL de la vidéo`;

    const response = await this.model.invoke([
      new SystemMessage(CREATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    return typeof response.content === "string" ? response.content : "";
  }

  private async generateInsights(
    context: VideoContext,
    hook: string,
    structure: string,
    retention: string,
    growth: string,
    formattedDuration: string,
  ): Promise<string> {
    const prompt = `Génère des INSIGHTS ACTIONNABLES basés sur les analyses.

TITRE: "${context.title}"
DURÉE VIDÉO: ${formattedDuration}

ANALYSES:
---HOOK---
${hook}
---STRUCTURE---
${structure}
---RÉTENTION---
${retention}
---CROISSANCE---
${growth}

## GÉNÈRE 8-12 INSIGHTS (avec références aux CITATIONS des analyses)

Pour chaque insight:
1. **Priorité**: critical / high / medium / low
2. **Catégorie**: hook / retention / cta / seo / content / growth
3. **Action**: Précise avec référence au timestamp si applicable
4. **Impact attendu**
5. **Effort**: facile / moyen / difficile

## QUICK WINS (3-5 actions immédiates)

Ordonne par IMPACT DÉCROISSANT.`;

    const response = await this.model.invoke([
      new SystemMessage(CREATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    return typeof response.content === "string" ? response.content : "";
  }

  private async compileFinalAnalysis(
    context: VideoContext,
    hook: string,
    structure: string,
    retention: string,
    growth: string,
    insights: string,
    formattedDuration: string,
    videoDuration: number,
  ): Promise<AnalysisResult> {
    const prompt = `Compile TOUTES ces analyses en un JSON structuré.

⚠️ CONTRAINTES ABSOLUES:
- Durée TOTALE: ${formattedDuration} (${videoDuration} secondes)
- TOUS les timestamps doivent être entre 0:00 et ${formattedDuration}
- Inclure des citations exactes dans les champs "quote"

TITRE: "${context.title}"

ANALYSES:
---HOOK---
${hook}
---STRUCTURE---
${structure}
---RÉTENTION---
${retention}
---CROISSANCE---
${growth}
---INSIGHTS---
${insights}

Fournis UNIQUEMENT un JSON valide:
{
  "overallScore": 75,
  "verdict": "Résumé qualité globale",
  "summary": "2-3 paragraphes avec CITATIONS du transcript",
  "videoDuration": "${formattedDuration}",
  "hookAnalysis": {
    "score": 70,
    "verdict": "bon",
    "strengths": ["point fort avec citation"],
    "weaknesses": ["faiblesse avec citation"],
    "suggestion": "Phrase d'accroche alternative",
    "firstWords": "Les vrais premiers mots",
    "exactQuotes": ["citation 1", "citation 2", "citation 3"]
  },
  "structure": {
    "intro": {
      "duration": "0:00-0:XX",
      "score": 65,
      "hasHook": true,
      "hasPromise": false,
      "feedback": "Feedback avec citation",
      "quote": "Citation exacte de l'intro"
    },
    "body": {
      "segments": [
        {
          "timestamp": "0:XX-X:XX",
          "duration": "X:XX",
          "topic": "Sujet",
          "engagementScore": 80,
          "retentionImpact": "boost",
          "strengths": ["force"],
          "improvements": ["amélioration"],
          "keyQuote": "Citation clé du segment"
        }
      ],
      "pacing": "optimal",
      "transitions": 3
    },
    "conclusion": {
      "duration": "X:XX-${formattedDuration}",
      "score": 55,
      "hasCta": true,
      "ctaType": "abonnement",
      "ctaStrength": 50,
      "feedback": "Feedback",
      "quote": "Citation du CTA"
    }
  },
  "retention": {
    "overallScore": 68,
    "predictedAvgViewDuration": "65%",
    "dropPoints": [
      {
        "timestamp": "X:XX",
        "reason": "Raison",
        "severity": "moderate",
        "quote": "Citation du moment problématique"
      }
    ],
    "peakMoments": [
      {
        "timestamp": "X:XX",
        "reason": "Raison",
        "replicable": true,
        "quote": "Citation du moment fort"
      }
    ],
    "benchmarkVsNiche": "Comparaison"
  },
  "growth": {
    "titleAnalysis": {
      "current": "${context.title}",
      "score": 60,
      "issues": ["problème"],
      "suggestions": ["suggestion"]
    },
    "thumbnailIdeas": ["idée"],
    "seoKeywords": ["keyword"],
    "contentGaps": ["gap"],
    "viralPotential": {
      "score": 45,
      "factors": ["facteur"],
      "missing": ["manquant"]
    },
    "monetizationAngles": ["angle"]
  },
  "insights": [
    {
      "priority": "critical",
      "category": "hook",
      "action": "Action",
      "expectedImpact": "Impact",
      "effort": "facile"
    }
  ],
  "quickWins": ["Action 1", "Action 2"],
  "keyPoints": ["Point clé"],
  "topics": ["Topic"],
  "targetAudience": "Audience cible",
  "recommendations": ["Recommandation"]
}

⚠️ VÉRIFICATION: Tous les timestamps sont-ils <= ${formattedDuration}?
IMPORTANT: Réponds UNIQUEMENT avec le JSON.`;

    const response = await this.model.invoke([
      new SystemMessage(
        "Tu compiles des analyses en JSON structuré. Réponds UNIQUEMENT avec un JSON valide. TOUS les timestamps doivent respecter la durée maximale fournie.",
      ),
      new HumanMessage(prompt),
    ]);

    const content =
      typeof response.content === "string" ? response.content : "";
    return this.parseAnalysisResponse(content, context, formattedDuration);
  }

  private parseAnalysisResponse(
    response: string,
    context: VideoContext,
    formattedDuration: string,
  ): AnalysisResult {
    try {
      const jsonMatch = /\{[\s\S]*\}/.exec(response);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<AnalysisResult>;
        return this.validateAndNormalize(parsed, context, formattedDuration);
      }
    } catch (error) {
      console.error("Failed to parse analysis response:", error);
    }

    return this.generateFallbackAnalysis(context, formattedDuration);
  }

  private validateAndNormalize(
    parsed: Partial<AnalysisResult>,
    context: VideoContext,
    formattedDuration: string,
  ): AnalysisResult {
    return {
      overallScore: parsed.overallScore ?? 50,
      verdict: parsed.verdict ?? "Analyse en cours",
      summary: parsed.summary ?? `Analyse de "${context.title}"`,
      videoDuration: formattedDuration,
      hookAnalysis: {
        score: parsed.hookAnalysis?.score ?? 50,
        verdict: parsed.hookAnalysis?.verdict ?? "moyen",
        strengths: parsed.hookAnalysis?.strengths ?? [],
        weaknesses: parsed.hookAnalysis?.weaknesses ?? [],
        suggestion: parsed.hookAnalysis?.suggestion ?? "",
        firstWords: parsed.hookAnalysis?.firstWords ?? "",
        exactQuotes: parsed.hookAnalysis?.exactQuotes ?? [],
      },
      structure: {
        intro: {
          duration: parsed.structure?.intro?.duration ?? "0:00-0:30",
          score: parsed.structure?.intro?.score ?? 50,
          hasHook: parsed.structure?.intro?.hasHook ?? false,
          hasPromise: parsed.structure?.intro?.hasPromise ?? false,
          feedback: parsed.structure?.intro?.feedback ?? "",
          quote: parsed.structure?.intro?.quote ?? "",
        },
        body: {
          segments: (parsed.structure?.body?.segments ?? []).map((s) => ({
            ...s,
            keyQuote: s.keyQuote ?? "",
          })),
          pacing: parsed.structure?.body?.pacing ?? "optimal",
          transitions: parsed.structure?.body?.transitions ?? 0,
        },
        conclusion: {
          duration: parsed.structure?.conclusion?.duration ?? "",
          score: parsed.structure?.conclusion?.score ?? 50,
          hasCta: parsed.structure?.conclusion?.hasCta ?? false,
          ctaType: parsed.structure?.conclusion?.ctaType ?? "",
          ctaStrength: parsed.structure?.conclusion?.ctaStrength ?? 0,
          feedback: parsed.structure?.conclusion?.feedback ?? "",
          quote: parsed.structure?.conclusion?.quote ?? "",
        },
      },
      retention: {
        overallScore: parsed.retention?.overallScore ?? 50,
        predictedAvgViewDuration:
          parsed.retention?.predictedAvgViewDuration ?? "50%",
        dropPoints: (parsed.retention?.dropPoints ?? []).map((d) => ({
          ...d,
          quote: d.quote ?? "",
        })),
        peakMoments: (parsed.retention?.peakMoments ?? []).map((p) => ({
          ...p,
          quote: p.quote ?? "",
        })),
        benchmarkVsNiche: parsed.retention?.benchmarkVsNiche ?? "",
      },
      growth: {
        titleAnalysis: {
          current: context.title,
          score: parsed.growth?.titleAnalysis?.score ?? 50,
          issues: parsed.growth?.titleAnalysis?.issues ?? [],
          suggestions: parsed.growth?.titleAnalysis?.suggestions ?? [],
        },
        thumbnailIdeas: parsed.growth?.thumbnailIdeas ?? [],
        seoKeywords: parsed.growth?.seoKeywords ?? [],
        contentGaps: parsed.growth?.contentGaps ?? [],
        viralPotential: {
          score: parsed.growth?.viralPotential?.score ?? 30,
          factors: parsed.growth?.viralPotential?.factors ?? [],
          missing: parsed.growth?.viralPotential?.missing ?? [],
        },
        monetizationAngles: parsed.growth?.monetizationAngles ?? [],
      },
      insights: (parsed.insights ?? []).map((i) => ({
        priority: i.priority ?? "medium",
        category: i.category ?? "content",
        action: i.action ?? "",
        expectedImpact: i.expectedImpact ?? "",
        effort: i.effort ?? "moyen",
      })),
      quickWins: parsed.quickWins ?? [],
      keyPoints: parsed.keyPoints ?? [],
      topics: parsed.topics ?? [],
      targetAudience: parsed.targetAudience ?? "",
      recommendations: parsed.recommendations ?? [],
    };
  }

  private generateFallbackAnalysis(
    context: VideoContext,
    formattedDuration: string,
  ): AnalysisResult {
    return {
      overallScore: 0,
      verdict: "Analyse incomplète - veuillez réessayer",
      summary: `Impossible d'analyser complètement "${context.title}". Veuillez réessayer.`,
      videoDuration: formattedDuration,
      hookAnalysis: {
        score: 0,
        verdict: "faible",
        strengths: [],
        weaknesses: ["Analyse non disponible"],
        suggestion: "",
        firstWords: "",
        exactQuotes: [],
      },
      structure: {
        intro: {
          duration: "",
          score: 0,
          hasHook: false,
          hasPromise: false,
          feedback: "",
          quote: "",
        },
        body: { segments: [], pacing: "optimal", transitions: 0 },
        conclusion: {
          duration: "",
          score: 0,
          hasCta: false,
          ctaType: "",
          ctaStrength: 0,
          feedback: "",
          quote: "",
        },
      },
      retention: {
        overallScore: 0,
        predictedAvgViewDuration: "",
        dropPoints: [],
        peakMoments: [],
        benchmarkVsNiche: "",
      },
      growth: {
        titleAnalysis: {
          current: context.title,
          score: 0,
          issues: [],
          suggestions: [],
        },
        thumbnailIdeas: [],
        seoKeywords: [],
        contentGaps: [],
        viralPotential: { score: 0, factors: [], missing: [] },
        monetizationAngles: [],
      },
      insights: [],
      quickWins: [],
      keyPoints: [],
      topics: [],
      targetAudience: "",
      recommendations: ["Réessayer l'analyse"],
    };
  }
}

export const createYouTubeAnalyzer = (apiKey?: string) => {
  return new YouTubeAnalyzer(apiKey);
};
