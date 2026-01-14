# Architecture des Workflows Langflow - Options et Recommandations

## 🎯 Questions Clés

1. **Disponibilité des workflows** : Qui peut utiliser quels workflows ?
2. **Création des workflows** : Qui peut créer/modifier les workflows ?
3. **Isolation des données** : Comment isoler les données par organisation ?

---

## 📋 Options d'Architecture

### Option 1 : **Workflows par Organisation** (Recommandé ✅)

**Principe :**
- Chaque organisation a ses propres workflows
- Les workflows sont créés/gérés par les admins de l'organisation
- Isolation complète entre organisations

**Avantages :**
- ✅ Isolation totale des données
- ✅ Personnalisation par organisation
- ✅ Sécurité renforcée
- ✅ Chaque org peut avoir ses propres workflows spécialisés

**Inconvénients :**
- ❌ Plus de configuration initiale
- ❌ Duplication potentielle de workflows similaires

**Structure DB actuelle :**
```prisma
model LangflowWorkflow {
  organizationId String  // ✅ Déjà par organisation
  name           String
  workflowId     String  // ID du workflow Langflow
  category       String  // "orchestrator", "youtube", etc.
  isActive       Boolean
}
```

**Cas d'usage :**
- Organisation A : Workflow orchestrateur + YouTube spécialisé
- Organisation B : Workflow orchestrateur + Instagram spécialisé
- Organisation C : Workflow orchestrateur uniquement

---

### Option 2 : **Workflows Globaux + Override par Organisation**

**Principe :**
- Workflows par défaut disponibles pour tous
- Possibilité d'override par organisation
- Workflows personnalisés par organisation en plus

**Avantages :**
- ✅ Workflows de base disponibles immédiatement
- ✅ Personnalisation possible
- ✅ Moins de configuration initiale

**Inconvénients :**
- ❌ Plus complexe à gérer
- ❌ Logique de priorité à implémenter

**Structure DB nécessaire :**
```prisma
model LangflowWorkflow {
  organizationId String?  // null = global, sinon = spécifique à l'org
  name           String
  workflowId     String
  category       String
  isDefault      Boolean  // Workflow par défaut pour cette catégorie
  isActive       Boolean
}
```

**Cas d'usage :**
- Workflow orchestrateur global (disponible pour tous)
- Organisation A : Override avec son propre orchestrateur
- Organisation B : Utilise le global + ajoute un workflow YouTube

---

### Option 3 : **Workflows par Utilisateur**

**Principe :**
- Chaque utilisateur peut créer ses propres workflows
- Workflows privés à l'utilisateur

**Avantages :**
- ✅ Personnalisation maximale
- ✅ Workflows privés

**Inconvénients :**
- ❌ Pas de partage entre membres d'une organisation
- ❌ Plus complexe à gérer
- ❌ Duplication importante

**Structure DB nécessaire :**
```prisma
model LangflowWorkflow {
  userId         String?  // Optionnel si par utilisateur
  organizationId String?  // Optionnel si par organisation
  name           String
  workflowId     String
  category       String
  isActive       Boolean
}
```

**Cas d'usage :**
- Utilisateur A : Son workflow personnalisé
- Utilisateur B : Son workflow personnalisé
- Pas de partage

---

## 💡 Recommandation : **Option 1 (Workflows par Organisation)**

### Pourquoi ?

1. **Votre schéma actuel** est déjà conçu pour ça (`organizationId` obligatoire)
2. **Isolation des données** : Chaque organisation a ses propres workflows et données
3. **Gestion simplifiée** : Les admins de l'organisation gèrent leurs workflows
4. **Sécurité** : Pas de fuite de données entre organisations
5. **Scalabilité** : Facile d'ajouter des workflows par organisation

### Structure Recommandée

```typescript
// Workflow par défaut créé lors de la création d'une organisation
{
  organizationId: "org_123",
  name: "Orchestrateur Principal",
  workflowId: "f9f60077-e4af-4900-a133-7fa6966117c7", // ID Langflow
  category: "orchestrator",
  isActive: true,
  config: JSON.stringify({
    tweaks: {
      "Chroma-Tpsjm": { collection_name: "org_123" },
      "Chroma-8JjDX": { collection_name: "org_123" },
      "Chroma-k8Dpx": { collection_name: "org_123" }
    }
  })
}
```

### Gestion des Workflows

**Création :**
- Par défaut : Un workflow orchestrateur est créé automatiquement lors de la création d'une organisation
- Manuelle : Les admins de l'organisation peuvent ajouter des workflows via une interface admin

**Utilisation :**
- Par défaut : Le workflow orchestrateur est utilisé
- Sélection : L'utilisateur peut choisir un workflow spécifique (si plusieurs disponibles)

---

## 🔧 Implémentation Recommandée

### 1. Création Automatique du Workflow Orchestrateur

```typescript
// Lors de la création d'une organisation
async function createDefaultWorkflow(organizationId: string) {
  await db.langflowWorkflow.create({
    data: {
      organizationId,
      name: "Orchestrateur Principal",
      workflowId: process.env.DEFAULT_LANGFLOW_WORKFLOW_ID ?? "",
      category: "orchestrator",
      isActive: true,
      config: JSON.stringify({
        tweaks: {
          "Chroma-Tpsjm": { collection_name: organizationId },
          "Chroma-8JjDX": { collection_name: organizationId },
          "Chroma-k8Dpx": { collection_name: organizationId }
        }
      })
    }
  });
}
```

### 2. Interface Admin pour Gérer les Workflows

**Routes tRPC à ajouter :**
- `chat.createWorkflow` : Créer un workflow pour l'organisation
- `chat.updateWorkflow` : Modifier un workflow
- `chat.deleteWorkflow` : Supprimer un workflow
- `chat.listWorkflows` : Liste des workflows de l'organisation (déjà fait)

**Permissions :**
- Seuls les admins/owners de l'organisation peuvent créer/modifier
- Tous les membres peuvent utiliser les workflows actifs

### 3. Sélection du Workflow dans le Chat

**Option A : Automatique (recommandé pour commencer)**
- Utilise toujours le workflow orchestrateur par défaut

**Option B : Sélection manuelle**
- Dropdown dans l'interface chat pour choisir le workflow
- Utile si plusieurs workflows spécialisés (YouTube, Instagram, etc.)

---

## 📊 Tableau Comparatif

| Critère | Par Organisation | Global + Override | Par Utilisateur |
|---------|-----------------|-------------------|-----------------|
| **Isolation** | ✅✅✅ | ✅✅ | ✅ |
| **Simplicité** | ✅✅ | ✅ | ✅✅ |
| **Personnalisation** | ✅✅ | ✅✅✅ | ✅✅✅ |
| **Partage** | ✅✅ (dans l'org) | ✅✅✅ | ❌ |
| **Sécurité** | ✅✅✅ | ✅✅ | ✅✅ |
| **Configuration** | Moyenne | Complexe | Simple |

---

## 🎯 Plan d'Action Recommandé

### Phase 1 : Workflows par Organisation (Actuel)
1. ✅ Modèle DB avec `organizationId`
2. ✅ Router tRPC pour récupérer les workflows
3. ⏳ Création automatique du workflow orchestrateur lors de la création d'org
4. ⏳ Interface admin pour gérer les workflows

### Phase 2 : Workflows Spécialisés (Optionnel)
1. Permettre la création de workflows spécialisés (YouTube, Instagram, etc.)
2. Sélection du workflow dans l'interface chat
3. Workflows partagés entre membres de l'organisation

### Phase 3 : Workflows Avancés (Futur)
1. Templates de workflows
2. Import/Export de workflows
3. Analytics par workflow

---

## ❓ Questions à Décider

1. **Création automatique** : Créer un workflow orchestrateur par défaut lors de la création d'une organisation ?
   - ✅ **OUI** : Simplifie l'expérience utilisateur

2. **Workflows multiples** : Permettre plusieurs workflows par organisation ?
   - ✅ **OUI** : Permet des workflows spécialisés (YouTube, Instagram, etc.)

3. **Permissions** : Qui peut créer/modifier les workflows ?
   - ✅ **Admins/Owners uniquement** : Sécurité et contrôle

4. **Workflows globaux** : Avoir des workflows par défaut disponibles pour toutes les organisations ?
   - ⚠️ **NON pour l'instant** : Commencer simple, ajouter plus tard si besoin

---

## 💬 Recommandation Finale

**Commencer avec : Workflows par Organisation uniquement**

1. **Création automatique** : Un workflow orchestrateur est créé lors de la création d'une organisation
2. **Gestion par admins** : Seuls les admins peuvent créer/modifier les workflows
3. **Utilisation par tous** : Tous les membres de l'organisation peuvent utiliser les workflows actifs
4. **Évolution future** : Ajouter les workflows globaux ou par utilisateur si besoin

**Avantages :**
- Simple à implémenter
- Sécurisé
- Scalable
- Facile à comprendre
