import type { PrismaClient } from "../../../generated/prisma";

// Cost per 1M tokens in cents (approximate pricing)
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
