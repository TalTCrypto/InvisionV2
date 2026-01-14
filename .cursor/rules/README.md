# Règles de Développement T3 Stack

Ce dossier contient les règles de développement adaptées pour le projet T3 Stack.

## Structure

- **🚨 components_usage_policy.mdc** : **RÈGLE ABSOLUE** - Utilisation OBLIGATOIRE des composants UI existants (LIRE EN PREMIER)
- **backend_development.mdc** : Guide backend avec tRPC, Prisma, Better Auth
- **frontend_development.mdc** : Guide frontend avec tRPC React, shadcn/ui, Zustand, Nuqs
- **project_init.mdc** : Guide d'initialisation d'un projet T3
- **components/basic_component.mdc** : Guide pour créer des composants avec shadcn/ui et tRPC
- **components/ui_components_reference.mdc** : 📚 **Référence complète de tous les composants UI (60+)** organisés par catégories
- **components/QUICK_REFERENCE.md** : Référence rapide pour trouver rapidement un composant

## ⚠️ RÈGLE CRITIQUE

**AVANT TOUT DÉVELOPPEMENT** : Lire `components_usage_policy.mdc`

**INTERDICTIONS** :
- ❌ JAMAIS de HTML brut pour les éléments UI
- ❌ JAMAIS de réinvention de composants
- ❌ JAMAIS de création sans vérifier d'abord

**OBLIGATOIRE** :
- ✅ TOUJOURS utiliser les 60+ composants existants dans `src/components/ui/`
- ✅ TOUJOURS consulter `ui_components_reference.mdc` avant de créer

## Stack Technique

- **Framework** : Next.js 15+ App Router
- **API** : tRPC (type-safe)
- **Styling** : Tailwind CSS + shadcn/ui
- **State** : Zustand + Nuqs + tRPC React Query
- **Forms** : React Hook Form + Zod
- **i18n** : next-intl
- **Dates** : date-fns
- **Auth** : Better Auth
- **DB** : Prisma + PostgreSQL
- **Icons** : Lucide React

## Utilisation

Ces règles sont automatiquement appliquées par Cursor selon les fichiers modifiés (globs définis dans chaque fichier).

## Notes

- Les règles sont adaptées spécifiquement pour la stack T3
- Tous les exemples utilisent tRPC au lieu de Server Actions/API Routes
- shadcn/ui, Zustand, Nuqs sont intégrés dans les guides
