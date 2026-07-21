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