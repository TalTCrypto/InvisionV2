# Admin User Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an admin page to manage beta users and track API credit consumption per user.

**Architecture:** Single page at `/dashboard/admin/users` with a data table, stats summary, and user creation dialog. A new `ApiUsage` Prisma model tracks global token consumption per user. The sidebar shows admin links for all admin users regardless of current route. Token tracking is instrumented in the `AgentExecutor` after each LLM call.

**Tech Stack:** Next.js 15 (App Router), tRPC 11, Prisma 6, Better Auth, shadcn/ui, Tailwind CSS 4

---

### Task 1: Prisma Schema — Add ApiUsage model

**Files:**

- Modify: `prisma/schema.prisma:30-63` (User model — add relation)
- Modify: `prisma/schema.prisma` (end of file — add ApiUsage model)

**Step 1: Add the ApiUsage model and User relation**

Add to `prisma/schema.prisma` after the last model:

```prisma
model ApiUsage {
  id                String   @id @default(cuid())
  userId            String   @unique
  totalInputTokens  Int      @default(0)
  totalOutputTokens Int      @default(0)
  totalCostCents    Int      @default(0)
  lastUpdatedAt     DateTime @updatedAt
  createdAt         DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("api_usage")
}
```

Add to the User model relations (after `businessResources`):

```prisma
  // Relations API Usage
  apiUsage ApiUsage? // Consommation API
```

**Step 2: Generate Prisma client and create migration**

Run: `npx prisma migrate dev --name add-api-usage-model`
Expected: Migration created successfully, Prisma client regenerated.

**Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ generated/
git commit -m "feat: add ApiUsage model for tracking API credit consumption per user"
```

---

### Task 2: API Usage Tracking Helper

**Files:**

- Create: `src/server/utils/api-usage.ts`

**Step 1: Create the tracking helper**

```typescript
import type { PrismaClient } from "../../../generated/prisma";

// Cost per 1M tokens in cents (approximate, GPT-4o pricing)
const COST_PER_1M_INPUT_TOKENS: Record<string, number> = {
  "gpt-4o": 250, // $2.50/1M input
  "gpt-4o-mini": 15, // $0.15/1M input
  "claude-sonnet-4.5": 300, // $3.00/1M input
};

const COST_PER_1M_OUTPUT_TOKENS: Record<string, number> = {
  "gpt-4o": 1000, // $10.00/1M output
  "gpt-4o-mini": 60, // $0.60/1M output
  "claude-sonnet-4.5": 1500, // $15.00/1M output
};

export async function trackApiUsage(
  db: PrismaClient,
  userId: string,
  inputTokens: number,
  outputTokens: number,
  model: string,
): Promise<void> {
  const inputCostRate = COST_PER_1M_INPUT_TOKENS[model] ?? 250;
  const outputCostRate = COST_PER_1M_OUTPUT_TOKENS[model] ?? 1000;

  const costCents = Math.round(
    (inputTokens * inputCostRate + outputTokens * outputCostRate) / 1_000_000,
  );

  await db.apiUsage.upsert({
    where: { userId },
    create: {
      userId,
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalCostCents: costCents,
    },
    update: {
      totalInputTokens: { increment: inputTokens },
      totalOutputTokens: { increment: outputTokens },
      totalCostCents: { increment: costCents },
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/server/utils/api-usage.ts
git commit -m "feat: add trackApiUsage helper for incrementing user API consumption"
```

---

### Task 3: Instrument AgentExecutor with token tracking

**Files:**

- Modify: `src/server/services/langchain-agents/core/agent-executor.ts:22-35` (constructor — add db)
- Modify: `src/server/services/langchain-agents/core/agent-executor.ts:99-106` (invoke — capture tokens)
- Modify: `src/server/services/langchain-agents/core/agent-executor.ts:260-270` (stream — capture tokens)

The `AgentExecutor` needs access to the `db` and `userId` to call `trackApiUsage`. The LangChain `invoke()` and `stream()` methods return `usage_metadata` on the result with `input_tokens` and `output_tokens`.

**Step 1: Add db parameter and import**

At top of `agent-executor.ts`, add import:

```typescript
import { trackApiUsage } from "~/server/utils/api-usage";
import type { PrismaClient } from "../../../../../generated/prisma";
```

Add `db` to constructor:

```typescript
constructor(
  model: LLMModel,
  private tools: BaseTool[],
  private systemPrompt: string,
  private memory: ConversationMemory,
  private db: PrismaClient,
  private maxIterations = 10,
  temperature = 0.3,
  private connectedIntegrations: ConnectedIntegration[] = [],
)
```

**Step 2: Track tokens after each LLM invoke in `execute()` method**

After `const result = await this.llm.invoke(...)` (line ~102), add:

```typescript
const usageMeta = (
  result as {
    usage_metadata?: { input_tokens?: number; output_tokens?: number };
  }
).usage_metadata;
if (usageMeta && context.userId) {
  void trackApiUsage(
    this.db,
    context.userId,
    usageMeta.input_tokens ?? 0,
    usageMeta.output_tokens ?? 0,
    model,
  ).catch((err) =>
    console.error("[AgentExecutor] Failed to track usage:", err),
  );
}
```

**Step 3: Track tokens in stream method**

In the `stream()` method, the LangChain stream doesn't return usage_metadata per-chunk. Instead, estimate tokens from the accumulated response length after each iteration completes. Add after the while loop ends (line ~385):

```typescript
// Estimate tokens for the stream (rough: 1 token ≈ 4 chars)
const estimatedInputTokens = Math.round(
  currentMessages.reduce((acc, m) => acc + String(m.content).length, 0) / 4,
);
const estimatedOutputTokens = Math.round(finalAnswer.length / 4);
if (context.userId) {
  void trackApiUsage(
    this.db,
    context.userId,
    estimatedInputTokens,
    estimatedOutputTokens,
    model,
  ).catch((err) =>
    console.error("[AgentExecutor] Failed to track usage:", err),
  );
}
```

Note: Store the `model` string as a private field set in constructor.

**Step 4: Update AgentFactory to pass `db` to AgentExecutor**

Find where `AgentExecutor` is instantiated and pass `db`. Check `src/server/services/langchain-agents/index.ts` or similar factory file.

**Step 5: Commit**

```bash
git add src/server/services/langchain-agents/
git commit -m "feat: instrument AgentExecutor to track API token usage per user"
```

---

### Task 4: Admin tRPC Endpoints

**Files:**

- Modify: `src/server/api/routers/admin.ts` (add new procedures)
- Modify: `src/server/utils/admin.ts` (add createBetaUser function)

**Step 1: Add createBetaUser utility**

In `src/server/utils/admin.ts`, add a new function after `createAdminUser`:

```typescript
export async function createBetaUser(
  db: PrismaClient,
  params: { email: string; password: string; name?: string },
): Promise<{ id: string; email: string; name: string }> {
  const normalizedEmail = params.email.toLowerCase().trim();

  const existingUser = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new Error(
      `Un utilisateur avec l'email ${normalizedEmail} existe deja.`,
    );
  }

  const hashedPassword = await hashPassword(params.password);

  const user = await db.user.create({
    data: {
      email: normalizedEmail,
      name: params.name ?? undefined,
      emailVerified: true,
      role: "user",
      accounts: {
        create: {
          accountId: normalizedEmail,
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? params.name ?? "User",
  };
}
```

**Step 2: Add admin endpoints**

In `src/server/api/routers/admin.ts`, add these procedures:

```typescript
// listUsersWithUsage — replaces existing listUsers
listUsersWithUsage: adminProcedure.query(async ({ ctx }) => {
  const users = await ctx.db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      banned: true,
      banReason: true,
      createdAt: true,
      apiUsage: {
        select: {
          totalInputTokens: true,
          totalOutputTokens: true,
          totalCostCents: true,
          lastUpdatedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return users;
}),

// createBetaUser
createBetaUser: adminProcedure
  .input(z.object({
    email: z.string().email("Email invalide"),
    password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caracteres"),
    name: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { createBetaUser } = await import("~/server/utils/admin");
    try {
      return await createBetaUser(ctx.db, input);
    } catch (error) {
      if (error instanceof Error && error.message.includes("existe")) {
        throw new TRPCError({ code: "CONFLICT", message: error.message });
      }
      throw error;
    }
  }),

// banUser
banUser: adminProcedure
  .input(z.object({
    userId: z.string(),
    reason: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.user.update({
      where: { id: input.userId },
      data: { banned: true, banReason: input.reason },
    });
    return { success: true };
  }),

// unbanUser
unbanUser: adminProcedure
  .input(z.object({ userId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.user.update({
      where: { id: input.userId },
      data: { banned: false, banReason: null },
    });
    return { success: true };
  }),

// resetUsage
resetUsage: adminProcedure
  .input(z.object({ userId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.apiUsage.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId },
      update: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostCents: 0,
      },
    });
    return { success: true };
  }),
```

**Step 3: Commit**

```bash
git add src/server/api/routers/admin.ts src/server/utils/admin.ts
git commit -m "feat: add admin endpoints for user management, ban/unban, and usage tracking"
```

---

### Task 5: Sidebar — Show admin links for all admins

**Files:**

- Modify: `src/components/dashboard/app-sidebar.tsx:50-60` (adminNavigation)
- Modify: `src/components/dashboard/app-sidebar.tsx:62-75` (isAdminRoute logic)
- Modify: `src/components/dashboard/app-sidebar.tsx:159-186` (admin section rendering)

**Step 1: Add Users link to adminNavigation**

```typescript
const adminNavigation = [
  { name: "Gestion Users", href: "/dashboard/admin/users", icon: Users },
  { name: "Workflows", href: "/dashboard/admin/workflows", icon: Settings },
];
```

**Step 2: Replace route-based check with role-based check**

Replace `const isAdminRoute = pathname?.startsWith("/dashboard/admin");` with:

```typescript
const { data: session } = authClient.useSession();
const isAdmin = session?.user?.role?.split(",").includes("admin") ?? false;
```

**Step 3: Update admin section rendering condition**

Change `{isAdminRoute && (` to `{isAdmin && (`.

Also add a `Shield` icon import from lucide-react for the admin section header, and use `Shield` instead of showing just text.

**Step 4: Commit**

```bash
git add src/components/dashboard/app-sidebar.tsx
git commit -m "feat: show admin section in sidebar for all admin users"
```

---

### Task 6: Admin Users Page

**Files:**

- Create: `src/app/dashboard/admin/users/page.tsx`

**Step 1: Create the admin users page**

This page contains:

1. Summary stats cards (total users, active, total cost)
2. "Creer un compte beta" button that opens a dialog
3. Data table with all users, usage, and actions (ban/unban, reset)

The page is a client component using tRPC queries/mutations:

- `api.admin.listUsersWithUsage.useQuery()`
- `api.admin.createBetaUser.useMutation()`
- `api.admin.banUser.useMutation()`
- `api.admin.unbanUser.useMutation()`
- `api.admin.resetUsage.useMutation()`

Use existing shadcn components: Card, Button, Dialog, Input, Label, Badge, DropdownMenu.

Format costs as: `(totalCostCents / 100).toFixed(2)` → "$X.XX"
Format tokens as: `(tokens / 1000).toFixed(1)` → "X.Xk"
Format dates with: `new Date(createdAt).toLocaleDateString("fr-FR")`

**Step 2: Commit**

```bash
git add src/app/dashboard/admin/users/
git commit -m "feat: add admin users management page with stats, table, and user creation"
```

---

### Task 7: Add Table UI component (if missing)

**Files:**

- Create: `src/components/ui/table.tsx` (via shadcn CLI)

**Step 1: Check if Table component exists**

If `src/components/ui/table.tsx` doesn't exist, install it:

Run: `npx shadcn@latest add table`

**Step 2: Commit if added**

```bash
git add src/components/ui/table.tsx
git commit -m "feat: add shadcn table component"
```

---

### Task 8: Verify and test

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run dev server**

Run: `npm run dev`
Expected: Starts without errors

**Step 3: Manual verification checklist**

- [ ] Admin user sees "Administration" section in sidebar on all pages
- [ ] Non-admin user does NOT see the admin section
- [ ] `/dashboard/admin/users` shows user table with usage data
- [ ] "Creer un compte beta" dialog works and creates a user
- [ ] Ban/Unban toggles work
- [ ] Reset usage works
- [ ] Non-admin accessing `/dashboard/admin/users` gets redirected

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: admin user management - complete implementation"
```
