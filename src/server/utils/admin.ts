import type { PrismaClient } from "../../../generated/prisma";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { hex } from "@better-auth/utils/hex";

interface CreateAdminParams {
  email: string;
  password: string;
  name?: string;
}

interface CreateAdminResult {
  success: true;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

// Fonction de hash identique à Better Auth (scrypt)
// Utilise exactement le même code que Better Auth pour garantir la compatibilité
export async function hashPassword(password: string): Promise<string> {
  const salt = hex.encode(crypto.getRandomValues(new Uint8Array(16)));
  const key = await scryptAsync(password.normalize("NFKC"), salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${hex.encode(key)}`;
}

/**
 * Créer un compte admin en utilisant le même système de hash que Better Auth
 * Crée directement User et Account avec accountId = email
 */
export async function createAdminUser(
  db: PrismaClient,
  params: CreateAdminParams,
): Promise<CreateAdminResult> {
  const { email, password, name } = params;

  // Normaliser l'email (lowercase + trim) pour éviter les problèmes de casse
  const normalizedEmail = email.toLowerCase().trim();

  // Vérifier si l'utilisateur existe déjà
  const existingUser = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new Error(
      `Un utilisateur avec l'email ${normalizedEmail} existe déjà.`,
    );
  }

  // Utiliser la fonction de hash compatible avec Better Auth (scrypt)
  const hashedPassword = await hashPassword(password);

  // Créer l'utilisateur avec le compte Account directement
  // accountId = email pour que Better Auth puisse trouver l'utilisateur
  const user = await db.user.create({
    data: {
      email: normalizedEmail,
      name: name ?? undefined,
      emailVerified: true,
      role: "admin", // Better Auth: rôle admin
      accounts: {
        create: {
          accountId: normalizedEmail, // accountId = email (important pour Better Auth)
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? name ?? "Admin",
    },
  };
}
