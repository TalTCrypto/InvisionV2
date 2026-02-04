export const SUMMARIZATION_PROMPT = `Résume cette conversation en conservant:
- Les points clés et décisions importantes
- Le contexte business mentionné
- Les objectifs et besoins exprimés
- Les insights ou recommandations données

Sois concis mais précis. Le résumé sera utilisé pour maintenir le contexte dans une conversation longue.

Conversation:
{conversation}

Résumé:`;

export const TOOL_RESULT_SYNTHESIS_PROMPT = `Synthétise ces résultats d'analyse en recommandations actionnables:

Résultats:
{results}

Crée une synthèse structurée avec:
1. Les points clés (3-5 insights majeurs)
2. Les opportunités identifiées
3. Les actions prioritaires avec effort estimé
4. Les prochaines étapes recommandées

Format: markdown avec listes et structure claire.`;

export const QUICK_WINS_EXTRACTION_PROMPT = `À partir de cette analyse, identifie les quick wins:

Analyse:
{analysis}

Quick wins = actions qui:
- Prennent moins de 2h à implémenter
- Ont un impact mesurable
- Ne nécessitent pas de ressources externes

Liste 3-5 quick wins par ordre de priorité avec:
- Action concrète
- Effort estimé (5min | 30min | 2h)
- Impact attendu

Format: liste numérotée, concise.`;
