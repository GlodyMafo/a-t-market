import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { consumeToken, issueToken, secondsUntilResend } from "./authToken.service";
import { sendAuthEmail } from "./auth.email.service";
import { NotFoundError } from "../utils/appError";

export const USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  role: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  gender: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

const MAX_ADDRESSES = 10;

export async function sendVerificationEmail(userId: string, email: string) {
  const raw = await issueToken(userId, "EMAIL_VERIFICATION");
  return sendAuthEmail("VERIFY_EMAIL", email, raw);
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
  if (!user) throw new NotFoundError("Compte introuvable");
  if (user.emailVerifiedAt) throw new Error("Votre adresse e-mail est déjà vérifiée");
  const wait = await secondsUntilResend(userId, "EMAIL_VERIFICATION");
  if (wait > 0) throw new Error(`Patientez ${wait} secondes avant de redemander un e-mail`);
  const sent = await sendVerificationEmail(userId, user.email);
  if (!sent) throw new Error("L'e-mail n'a pas pu être envoyé. Réessayez plus tard.");
}

export async function verifyEmail(rawToken: string) {
  const userId = await consumeToken(rawToken, "EMAIL_VERIFICATION");
  if (!userId) throw new Error("Ce lien est invalide ou a expiré");
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
}

/** Répond toujours de la même façon : ne révèle jamais si l'adresse a un compte. */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return;
  if ((await secondsUntilResend(user.id, "PASSWORD_RESET", 60)) > 0) return;
  const raw = await issueToken(user.id, "PASSWORD_RESET");
  await sendAuthEmail("RESET_PASSWORD", user.email, raw);
}

export async function resetPassword(rawToken: string, password: string) {
  const userId = await consumeToken(rawToken, "PASSWORD_RESET");
  if (!userId) throw new Error("Ce lien est invalide ou a expiré");
  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  // Recevoir l'e-mail prouve aussi la possession de l'adresse.
  await prisma.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user) throw new NotFoundError("Compte introuvable");
  if (!(await bcrypt.compare(currentPassword, user.password))) throw new Error("Mot de passe actuel incorrect");
  await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(newPassword, 10) } });
}

export async function updateProfile(
  userId: string,
  data: { firstName?: string | null; lastName?: string | null; phone?: string; birthDate?: string | null; gender?: "FEMALE" | "MALE" | null }
) {
  const { birthDate, phone, ...rest } = data;
  if (phone) {
    const other = await prisma.user.findFirst({ where: { phone, NOT: { id: userId } }, select: { id: true } });
    if (other) throw new Error("Ce numéro est déjà utilisé");
  }
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      ...(phone !== undefined ? { phone } : {}),
      ...(birthDate !== undefined ? { birthDate: birthDate === null ? null : new Date(`${birthDate}T00:00:00Z`) } : {}),
    },
    select: USER_SELECT,
  });
}

// ---------- Adresses ----------
export const listAddresses = (userId: string) =>
  prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });

type AddressInput = {
  label?: string | null; fullName: string; phone: string; city: string; commune?: string | null;
  neighborhood: string; street: string; landmark?: string | null; isDefault?: boolean;
};

export async function createAddress(userId: string, input: AddressInput) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) throw new Error(`Vous pouvez enregistrer ${MAX_ADDRESSES} adresses au maximum`);
    const makeDefault = input.isDefault === true || count === 0;
    if (makeDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.create({ data: { ...input, isDefault: makeDefault, userId } });
  });
}

export async function updateAddress(userId: string, addressId: string, input: Partial<AddressInput>) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.address.findFirst({ where: { id: addressId, userId } });
    if (!found) throw new NotFoundError("Adresse introuvable");
    if (input.isDefault === true) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    // Une adresse par défaut ne peut pas être « désactivée » directement : on en choisit une autre.
    const { isDefault, ...rest } = input;
    return tx.address.update({ where: { id: addressId }, data: { ...rest, ...(isDefault === true ? { isDefault: true } : {}) } });
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  await prisma.$transaction(async (tx) => {
    const found = await tx.address.findFirst({ where: { id: addressId, userId } });
    if (!found) throw new NotFoundError("Adresse introuvable");
    await tx.address.delete({ where: { id: addressId } });
    if (found.isDefault) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}