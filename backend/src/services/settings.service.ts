import { z } from "zod";
import { prisma } from "../lib/prisma";

export async function initializeSettings() {

  const settings =
    await prisma.globalSettings.findFirst();

  if (settings) {
    return settings;
  }

  return prisma.globalSettings.create({

    data: {

      commissionRate: 15,
      chinaPricePerKg: 14,
      fixedFee: 8

    }

  });

}

export async function getSettings() {

  const settings =
    await prisma.globalSettings.findFirst();

  if (!settings) {

    throw new Error(
      "Configuration introuvable"
    );

  }

  return settings;

}

// Bornes de bon sens : une faute de frappe (ex. 1500 au lieu de 15) ne doit pas passer.
const settingsUpdateSchema = z
  .object({
    commissionRate: z.number().min(0).max(100),
    chinaPricePerKg: z.number().positive().max(500),
    fixedFee: z.number().min(0).max(1000)
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Aucun réglage à modifier"
  });

export async function updateSettings(
  data: unknown
) {
  const parsed = settingsUpdateSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(
      "Réglages invalides : commissionRate entre 0 et 100, chinaPricePerKg entre 0 (exclu) et 500, fixedFee entre 0 et 1000, nombres uniquement."
    );
  }

  const settings =
    await prisma.globalSettings.findFirst();

  if (!settings) {
    throw new Error(
      "Configuration introuvable"
    );
  }

  return prisma.globalSettings.update({
    where: {
      id: settings.id
    },
    data: parsed.data
  });
}