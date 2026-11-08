import { z } from "zod";
import { prisma } from "../lib/prisma";

export async function initializeSettings() {
  const settings = await prisma.globalSettings.findFirst();

  if (settings) {
    return settings;
  }

  return prisma.globalSettings.create({
    data: {
      commissionRate: 15,
      chinaPricePerKg: 14,
      fixedFee: 8,
      // Aucun taux AED → USD fictif : l'administrateur devra le configurer.
    },
  });
}

export async function getSettings() {
  const settings = await prisma.globalSettings.findFirst();

  if (!settings) {
    throw new Error("Configuration introuvable");
  }

  return settings;
}

// Bornes de validation pour éviter les erreurs de saisie.
const settingsUpdateSchema = z
  .object({
    commissionRate: z.number().min(0).max(100),
    chinaPricePerKg: z.number().positive().max(500),
    fixedFee: z.number().min(0).max(1000),
    // Nombre de dollars USD obtenu pour 1 AED.
    aedToUsdRate: z.number().positive().max(10),
    // Nombre de dollars USD obtenu pour 1 CNY.
    cnyToUsdRate: z.number().positive().max(10),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Aucun réglage à modifier",
  });

export async function updateSettings(data: unknown) {
  const parsed = settingsUpdateSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(
      "Réglages invalides : commissionRate entre 0 et 100, " +
      "chinaPricePerKg entre 0 (exclu) et 500, " +
      "fixedFee entre 0 et 1000, " +
      "aedToUsdRate entre 0 (exclu) et 10, nombres uniquement. " +
      "cnyToUsdRate entre 0 (exclu) et 10, nombres uniquement."
    );
  }

  const settings = await prisma.globalSettings.findFirst();

  if (!settings) {
    throw new Error("Configuration introuvable");
  }

  return prisma.globalSettings.update({
    where: {
      id: settings.id,
    },
    data: parsed.data,
  });
}