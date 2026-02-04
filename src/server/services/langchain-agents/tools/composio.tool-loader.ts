import type { Composio } from "@composio/core";
import { BaseTool } from "./base-tool";
import type { ToolExecutionContext } from "../types";
import { z } from "zod";
import { getCachedConnectedAccounts } from "~/server/utils/composio-cache";

/**
 * Represents a connected integration returned by Composio.
 */
export interface ConnectedIntegration {
  accountId: string;
  toolkitSlug: string;
  status: string;
}

// Tool slug patterns to exclude — ACL management, file uploads, and other
// operations that are not useful for a social media analysis product.
const EXCLUDED_TOOL_PATTERNS = ["_acl_", "upload_video"];

/**
 * ComposioToolLoader — loads live tools from the Composio platform based on
 * the user's connected accounts.
 *
 * Flow:
 *   1. Fetch connected accounts via Composio SDK (with cache).
 *   2. For each connected toolkit, fetch its available tool definitions.
 *   3. Wrap each tool as a BaseTool that calls composio.tools.execute() at runtime.
 */
export class ComposioToolLoader {
  constructor(private composioClient: Composio) {}

  /**
   * Returns the list of connected integrations for a given Composio userId.
   * Useful for injecting integration awareness into the system prompt.
   */
  async getConnectedIntegrations(
    composioUserId: string,
  ): Promise<ConnectedIntegration[]> {
    try {
      const accounts = await getCachedConnectedAccounts(
        this.composioClient,
        composioUserId,
      );

      return accounts
        .filter((a) => a.status === "ACTIVE" && a.toolkit?.slug)
        .map((a) => ({
          accountId: a.id,
          toolkitSlug: a.toolkit!.slug!,
          status: a.status,
        }));
    } catch (error) {
      console.error(
        "[ComposioToolLoader] Failed to get connected integrations:",
        error,
      );
      return [];
    }
  }

  /**
   * Main entry point: loads BaseTool instances for all connected accounts.
   *
   * @param composioUserId  The user ID used inside Composio (e.g. org_<orgId>_user_<userId>).
   */
  async loadToolsForUser(composioUserId: string): Promise<BaseTool[]> {
    try {
      const integrations = await this.getConnectedIntegrations(composioUserId);

      if (integrations.length === 0) {
        console.log(
          `[ComposioToolLoader] No connected accounts for ${composioUserId}`,
        );
        return [];
      }

      const toolkitSlugs = [...new Set(integrations.map((i) => i.toolkitSlug))];
      console.log(
        `[ComposioToolLoader] Connected toolkits: ${toolkitSlugs.join(", ")}`,
      );

      const tools: BaseTool[] = [];

      // Fetch available tools per toolkit and filter out useless ones.
      for (const slug of toolkitSlugs) {
        const rawTools = await this.composioClient.tools.getRawComposioTools({
          toolkits: [slug],
          limit: 15,
        });

        console.log(
          `\n[ComposioToolLoader] 📦 ${slug} — ${rawTools.length} tool(s) available`,
        );

        for (const tool of rawTools) {
          const slugLower = tool.slug.toLowerCase();
          const excluded = EXCLUDED_TOOL_PATTERNS.some((p) =>
            slugLower.includes(p),
          );

          // Full definition log: slug, description, every param with type/required/desc
          const reqSet = new Set(tool.inputParameters?.required ?? []);
          const params = tool.inputParameters?.properties
            ? Object.entries(tool.inputParameters.properties)
                .map(([key, val]) => {
                  const p = val as {
                    type?: string;
                    description?: string;
                    enum?: unknown[];
                  };
                  const req = reqSet.has(key) ? "" : "?";
                  const enumStr = p.enum ? ` [${p.enum.join("|")}]` : "";
                  return `${key}${req}: ${p.type ?? "any"}${enumStr}${p.description ? ` — ${p.description}` : ""}`;
                })
                .join("\n        ")
            : "none";

          console.log(
            `  ${excluded ? "⛔" : "✅"} ${tool.slug}\n` +
              `     ${tool.description ?? tool.name}\n` +
              `     params: ${params}`,
          );

          if (excluded) continue;
          tools.push(this.wrapRawTool(tool, composioUserId));
        }
      }

      console.log(
        `[ComposioToolLoader] Loaded ${tools.length} tools from ${toolkitSlugs.length} toolkit(s)`,
      );
      return tools;
    } catch (error) {
      console.error("[ComposioToolLoader] Failed to load tools:", error);
      return [];
    }
  }

  /**
   * Wraps a raw Composio Tool definition into a BaseTool that the agent can call.
   */
  private wrapRawTool(
    rawTool: { slug: string; name: string; description?: string; inputParameters?: { properties?: Record<string, unknown>; required?: string[] }; toolkit?: { slug?: string; name?: string } },
    composioUserId: string,
  ): BaseTool {
    const composioClient = this.composioClient;
    const slug = rawTool.slug;
    const toolkitSlug = rawTool.toolkit?.slug ?? "unknown";
    const toolName = slug.toLowerCase();
    const toolDescription =
      (rawTool.description ?? rawTool.name) +
      ` (connected ${rawTool.toolkit?.name ?? toolkitSlug} account)`;

    // Build a zod schema from inputParameters
    const schema = this.buildSchema(rawTool.inputParameters);

    // Inline class so each instance captures its own closure vars
    return new (class extends BaseTool<Record<string, unknown>, unknown> {
      readonly name = toolName;
      readonly description = toolDescription;
      readonly schema = schema;
      readonly tags = ["composio", toolkitSlug.toLowerCase()];

      async execute(
        input: Record<string, unknown>,
        _context: ToolExecutionContext,
      ): Promise<unknown> {
        console.log(
          `[Composio:${slug}] → arguments:`,
          JSON.stringify(input),
        );
        const result = await composioClient.tools.execute(slug, {
          userId: composioUserId,
          arguments: input,
          dangerouslySkipVersionCheck: true,
        });
        console.log(
          `[Composio:${slug}] ← result:`,
          JSON.stringify(result).slice(0, 2000),
        );
        return result;
      }
    })();
  }

  /**
   * Converts a Composio inputParameters JSON schema to a Zod object schema,
   * respecting the actual declared types (boolean, number, array, etc.).
   */
  private buildSchema(
    inputParams?: {
      properties?: Record<string, unknown>;
      required?: string[];
    },
  ): z.ZodSchema {
    if (!inputParams?.properties) {
      return z.object({}).passthrough();
    }

    const required = new Set(inputParams.required ?? []);
    const fields: Record<string, z.ZodTypeAny> = {};

    for (const [key, val] of Object.entries(inputParams.properties)) {
      const prop = (typeof val === "object" && val !== null ? val : {}) as {
        type?: string;
        description?: string;
        items?: { type?: string };
      };
      const desc = prop.description ?? "";

      let base: z.ZodTypeAny;
      switch (prop.type) {
        case "boolean":
          base = z.boolean().describe(desc);
          break;
        case "number":
        case "integer":
          base = z.number().describe(desc);
          break;
        case "array":
          // inner type defaults to string if not specified
          const itemType = prop.items?.type;
          const innerSchema =
            itemType === "number" || itemType === "integer"
              ? z.number()
              : z.string();
          base = z.array(innerSchema).describe(desc);
          break;
        default:
          // string or unknown — accept anything, coerce via z.any
          base = z.any().describe(desc);
          break;
      }

      fields[key] = required.has(key) ? base : base.optional();
    }

    return z.object(fields).passthrough();
  }
}

