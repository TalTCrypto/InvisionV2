import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { organization } from "better-auth/plugins";

import { env } from "~/env";
import { db } from "~/server/db";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql", // or "sqlite" or "mysql"
  }),
  baseURL:
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000",
  secret: env.BETTER_AUTH_SECRET ?? "change-me-in-production-min-32-chars",
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
    },
  },
  plugins: [
    admin({
      // Configuration des permissions par défaut
      // Les admins ont accès à tout, les users n'ont aucun accès admin
    }),
    organization({
      // Configuration du plugin organization
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
