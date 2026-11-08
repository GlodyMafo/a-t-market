"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSettings = initializeSettings;
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
async function initializeSettings() {
    const settings = await prisma_1.prisma.globalSettings.findFirst();
    if (settings) {
        return settings;
    }
    return prisma_1.prisma.globalSettings.create({
        data: {
            commissionRate: 15,
            chinaPricePerKg: 14,
            fixedFee: 8,
            // Aucun taux AED → USD fictif : l'administrateur devra le configurer.
        },
    });
}
async function getSettings() {
    const settings = await prisma_1.prisma.globalSettings.findFirst();
    if (!settings) {
        throw new Error("Configuration introuvable");
    }
    return settings;
}
// Bornes de validation pour éviter les erreurs de saisie.
const settingsUpdateSchema = zod_1.z
    .object({
    commissionRate: zod_1.z.number().min(0).max(100),
    chinaPricePerKg: zod_1.z.number().positive().max(500),
    fixedFee: zod_1.z.number().min(0).max(1000),
    // Nombre de dollars USD obtenu pour 1 AED.
    aedToUsdRate: zod_1.z.number().positive().max(10),
    // Nombre de dollars USD obtenu pour 1 CNY.
    cnyToUsdRate: zod_1.z.number().positive().max(10),
})
    .partial()
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "Aucun réglage à modifier",
});
async function updateSettings(data) {
    const parsed = settingsUpdateSchema.safeParse(data);
    if (!parsed.success) {
        throw new Error("Réglages invalides : commissionRate entre 0 et 100, " +
            "chinaPricePerKg entre 0 (exclu) et 500, " +
            "fixedFee entre 0 et 1000, " +
            "aedToUsdRate entre 0 (exclu) et 10, nombres uniquement. " +
            "cnyToUsdRate entre 0 (exclu) et 10, nombres uniquement.");
    }
    const settings = await prisma_1.prisma.globalSettings.findFirst();
    if (!settings) {
        throw new Error("Configuration introuvable");
    }
    return prisma_1.prisma.globalSettings.update({
        where: {
            id: settings.id,
        },
        data: parsed.data,
    });
}
