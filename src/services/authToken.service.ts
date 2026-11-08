import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";

export type AuthTokenKind = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export const TOKEN_TTL_MS: Record<AuthTokenKind, number> = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Crée un jeton, invalide les précédents du même type, et retourne la valeur brute (jamais stockée). */
export async function issueToken(userId: string, type: AuthTokenKind): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.create({
      data: { userId, type, tokenHash: hash(raw), expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]) },
    }),
  ]);
  return raw;
}

/** Consomme un jeton valide (non utilisé, non expiré). Retourne l'identifiant du compte, ou null. */
export async function consumeToken(raw: string, type: AuthTokenKind): Promise<string | null> {
  const tokenHash = hash(raw);
  const found = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!found || found.type !== type || found.usedAt || found.expiresAt.getTime() < Date.now()) return null;

  // updateMany conditionnel : deux requêtes simultanées ne peuvent pas consommer le même jeton.
  const { count } = await prisma.authToken.updateMany({
    where: { id: found.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? found.userId : null;
}

/** Délai minimal entre deux e-mails du même type, en secondes (anti-spam). */
export async function secondsUntilResend(userId: string, type: AuthTokenKind, cooldownSec = 60) {
  const last = await prisma.authToken.findFirst({ where: { userId, type }, orderBy: { createdAt: "desc" } });
  if (!last) return 0;
  const wait = cooldownSec - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
  return Math.max(wait, 0);
}