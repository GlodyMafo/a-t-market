import { prisma } from "../lib/prisma";

export async function initializeSettings() {

  const settings =
    await prisma.globalSettings.findFirst();

  if (settings) {
    return settings;
  }

  return prisma.globalSettings.create({

    data: {

      commissionRate: 10,

      chinaPricePerKg: 12,

      fixedFee: 5

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


export async function updateSettings(
  data: {
    commissionRate?: number;
    chinaPricePerKg?: number;
    fixedFee?: number;
  }
) {

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

    data

  });

}