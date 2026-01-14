# Architecture Chat IA - InVision

## 🎯 Objectifs

1. **IA Orchestrateur** : Une IA principale qui comprend toutes les intégrations de l'organisation
2. **IA Spécialisées** : Des IA par intégration (optionnel, pour plus tard)
3. **Workflows Langflow** : Gérés par organisation
4. **Collections Chroma** : Utilisent l'ID de l'organisation comme collection_name

## 🏗️ Architecture Proposée

### 1. Modèle de Données

```prisma
model LangflowWorkflow {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  description    String?
  workflowId     String   // ID du workflow Langflow
  category       String   // "orchestrator", "youtube", "instagram", etc.
  isActive       Boolean  @default(true)
  config         String?  // JSON config (tweaks, etc.)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([organizationId, category])
  @@map("langflow_workflow")
}

model ChatSession {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  workflowId     String?  // ID du workflow Langflow utilisé
  title          String?  // Titre de la conversation (généré automatiquement)
  messages       String   // JSON array des messages
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([userId])
  @@index([organizationId, userId])
  @@map("chat_session")
}
```

### 2. Structure des Workflows Langflow

#### Workflow Orchestrateur (par défaut)
- **ID** : Configurable par organisation
- **Collections Chroma** : Utilisent `organizationId` comme `collection_name`
- **Capacités** :
  - Accès à toutes les intégrations de l'organisation
  - Compréhension cross-platform
  - Actions orchestrées

#### Workflows Spécialisés (optionnel)
- **YouTube** : Spécialisé pour YouTube
- **Instagram** : Spécialisé pour Instagram
- **Stripe** : Spécialisé pour Stripe
- etc.

### 3. Flow d'Utilisation

```
1. Utilisateur ouvre /dashboard/chat
2. Système récupère l'organisation active
3. Système charge les workflows disponibles pour cette organisation
4. Par défaut, utilise le workflow "orchestrator"
5. Utilisateur peut sélectionner un workflow spécialisé
6. Chaque message est envoyé à Langflow avec :
   - workflowId
   - organizationId (pour les tweaks Chroma)
   - sessionId (pour la continuité)
   - input_value (message de l'utilisateur)
```

### 4. API Langflow

```typescript
// Structure de la requête
{
  output_type: "chat",
  input_type: "chat",
  input_value: "message de l'utilisateur",
  tweaks: {
    "Chroma-Tpsjm": {
      "collection_name": organizationId
    },
    "Chroma-8JjDX": {
      "collection_name": organizationId
    },
    "Chroma-k8Dpx": {
      "collection_name": organizationId
    }
  },
  session_id: chatSessionId
}
```

### 5. Gestion des Intégrations

**Problème actuel** : Les intégrations sont rattachées aux utilisateurs, pas aux organisations.

**Solution** :
- Option 1 : Créer un mapping organisation → intégrations via les membres
- Option 2 : Utiliser l'ID de l'organisation comme `entityId` dans Composio (nécessite migration)
- Option 3 : Agréger les intégrations de tous les membres de l'organisation

**Recommandation** : Option 3 (agrégation) pour l'instant, puis migration vers Option 2 si nécessaire.

## 📋 Plan d'Implémentation

### Phase 1 : Structure de Base
1. ✅ Créer les modèles Prisma
2. ✅ Créer le router tRPC `chat.ts`
3. ✅ Créer la page `/dashboard/chat`
4. ✅ Interface de chat basique

### Phase 2 : Intégration Langflow
1. ✅ Configuration Langflow (API key, base URL)
2. ✅ Procédure pour lister les workflows d'une organisation
3. ✅ Procédure pour envoyer un message
4. ✅ Gestion des sessions

### Phase 3 : Workflows par Organisation
1. ✅ Système de création/configuration de workflows
2. ✅ Interface admin pour gérer les workflows
3. ✅ Sélection de workflow dans l'interface chat

### Phase 4 : IA Spécialisées (optionnel)
1. ✅ Workflows spécialisés par intégration
2. ✅ Sélection automatique du workflow selon le contexte

## 🔧 Configuration Requise

### Variables d'Environnement
```env
LANGFLOW_API_URL=https://langflow.srv1097345.hstgr.cloud
LANGFLOW_API_KEY=your_api_key_here
```

### Workflow Langflow par Défaut
- **ID** : Configurable (peut être différent par organisation)
- **Collections Chroma** : Utilisent `organizationId`
- **Intégrations** : Accès via Composio avec les comptes de l'organisation
