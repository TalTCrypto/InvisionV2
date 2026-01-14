import { PrismaClient } from "../generated/prisma/index.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { hex } from "@better-auth/utils/hex";

const prisma = new PrismaClient();

// Fonction de hash identique à Better Auth (scrypt)
// Utilise exactement le même code que Better Auth pour garantir la compatibilité
async function hashPassword(password: string): Promise<string> {
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

async function createUser() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] ?? "Admin";

  if (!email || !password) {
    console.error("❌ Usage: npm run create-user <email> <password> [name]");
    console.error(
      "   Example: npm run create-user user@invision.com mypassword123 John Doe",
    );
    process.exit(1);
  }

  if (!email.includes("@")) {
    console.error("❌ Email invalide");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("❌ Le mot de passe doit faire au moins 8 caractères");
    process.exit(1);
  }

  // Normaliser l'email (lowercase + trim)
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Vérifier si l'utilisateur existe déjà
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      console.error(`❌ Un compte avec l'email ${normalizedEmail} existe déjà`);
      process.exit(1);
    }

    // Utiliser la fonction de hash compatible avec Better Auth (scrypt)
    const hashedPassword = await hashPassword(password);

    // Créer l'utilisateur avec le compte Account directement
    // accountId = email pour que Better Auth puisse trouver l'utilisateur
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name ?? undefined,
        emailVerified: true,
        role: "user", // Rôle utilisateur normal (pas admin)
        accounts: {
          create: {
            accountId: normalizedEmail, // accountId = email (important pour Better Auth)
            providerId: "credential",
            password: hashedPassword,
          },
        },
      },
    });

    console.log("\n✅ Compte utilisateur créé avec succès !");
    console.log(`   Email: ${user.email}`);
    console.log(`   Nom: ${user.name ?? "Utilisateur"}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Rôle: ${user.role}`);
    console.log(
      "\n💡 Vous pouvez maintenant vous connecter avec ces identifiants.",
    );
  } catch (error) {
    console.error("❌ Erreur lors de la création du compte:", error);
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void createUser();
