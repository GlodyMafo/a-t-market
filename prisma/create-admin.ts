import "dotenv/config";
import bcrypt from "bcrypt";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// bcrypt ignore tout ce qui dépasse 72 octets : on refuse plutôt que de tronquer.
const emailSchema = z.string().trim().toLowerCase().max(254).email();
const passwordSchema = z
  .string()
  .min(12, "Le mot de passe admin doit contenir au moins 12 caractères")
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "Le mot de passe est trop long (72 octets maximum)"
  );

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL est absente.");
  }

  const emailParse = emailSchema.safeParse(process.env.ADMIN_EMAIL);
  if (!emailParse.success) {
    throw new Error("ADMIN_EMAIL est absent ou invalide.");
  }
  const email = emailParse.data;

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    // On affiche la base visée (sans identifiants) pour éviter de se tromper d'environnement.
    console.log(`Base visée : ${new URL(databaseUrl).host}`);

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.role === "ADMIN") {
        console.log(`✓ ${email} est déjà ADMIN. Rien n'a été modifié.`);
        return;
      }
      await prisma.user.update({
        where: { email },
        data: { role: "ADMIN" },
      });
      console.log(
        `✓ ${email} existait : promu ADMIN. Son mot de passe n'a pas été modifié.`
      );
      return;
    }

    const passwordParse = passwordSchema.safeParse(process.env.ADMIN_PASSWORD);
    if (!passwordParse.success) {
      throw new Error(
        passwordParse.error.issues[0]?.message ??
          "ADMIN_PASSWORD est absent ou invalide."
      );
    }

    const hashed = await bcrypt.hash(passwordParse.data, 10);

    await prisma.user.create({
      data: { email, password: hashed, role: "ADMIN" },
    });
    console.log(`✓ Compte ADMIN créé : ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});