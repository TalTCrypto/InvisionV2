# Admin User Management — Design

## Context

Beta fermee. Besoin d'une page admin pour:

- Voir tous les users et leur consommation de credits API OpenAI
- Creer des comptes beta directement (email + mot de passe temporaire)
- Bannir/debannir des users
- Suivre la consommation globale

## Architecture

Approche monolithique: une seule page `/dashboard/admin/users`.

### Base de donnees

Nouveau modele Prisma:

```prisma
model ApiUsage {
  id                String   @id @default(cuid())
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  totalInputTokens  Int      @default(0)
  totalOutputTokens Int      @default(0)
  totalCostCents    Int      @default(0)
  lastUpdatedAt     DateTime @updatedAt
  createdAt         DateTime @default(now())
}
```

Relation ajoutee sur User: `apiUsage ApiUsage?`

### Endpoints tRPC (admin router)

| Endpoint                   | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `admin.listUsersWithUsage` | Liste users + ApiUsage join                         |
| `admin.createBetaUser`     | Cree user avec scrypt hash (Better Auth compatible) |
| `admin.banUser`            | Met `banned = true`                                 |
| `admin.unbanUser`          | Met `banned = false`                                |
| `admin.resetUsage`         | Remet compteurs ApiUsage a zero                     |

Tous proteges par `adminProcedure`.

### UI — `/dashboard/admin/users`

**Header:** Stats resumees (total users, actifs, consommation totale) + bouton "Creer compte beta"

**Tableau:**

- Email, Nom, Role, Cree le, Tokens In, Tokens Out, Cout estime, Statut, Actions

**Dialog creation:** Email, Nom, Mot de passe temporaire

**Actions par user:** Bannir/Debannir, Reset compteur

### Sidebar

Modifier `app-sidebar.tsx`:

- Le groupe "Administration" avec lien "Gestion Users" visible pour tout admin
- Condition: `userRole?.split(",").includes("admin")` (au lieu de `pathname.startsWith("/dashboard/admin")`)

### Instrumentation API

Helper `trackApiUsage(userId, inputTokens, outputTokens, model)` qui upsert le compteur ApiUsage. Appele dans le service LangChain apres chaque completion.

## Decisions

- Compteur global simple (pas de log par appel)
- Creation directe de comptes (pas de systeme d'invitation)
- Lien admin toujours visible pour les admins dans la sidebar
- Couts stockes en centimes (Int) pour eviter les problemes de floats
