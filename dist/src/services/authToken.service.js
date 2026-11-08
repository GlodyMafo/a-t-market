"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_TTL_MS = void 0;
exports.issueToken = issueToken;
exports.consumeToken = consumeToken;
exports.secondsUntilResend = secondsUntilResend;
const node_crypto_1 = require("node:crypto");
const prisma_1 = require("../lib/prisma");
exports.TOKEN_TTL_MS = {
    EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
    PASSWORD_RESET: 60 * 60 * 1000,
};
const hash = (raw) => (0, node_crypto_1.createHash)("sha256").update(raw).digest("hex");
/** Crée un jeton, invalide les précédents du même type, et retourne la valeur brute (jamais stockée). */
async function issueToken(userId, type) {
    const raw = (0, node_crypto_1.randomBytes)(32).toString("base64url");
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.authToken.updateMany({
            where: { userId, type, usedAt: null },
            data: { usedAt: new Date() },
        }),
        prisma_1.prisma.authToken.create({
            data: { userId, type, tokenHash: hash(raw), expiresAt: new Date(Date.now() + exports.TOKEN_TTL_MS[type]) },
        }),
    ]);
    return raw;
}
/** Consomme un jeton valide (non utilisé, non expiré). Retourne l'identifiant du compte, ou null. */
async function consumeToken(raw, type) {
    const tokenHash = hash(raw);
    const found = await prisma_1.prisma.authToken.findUnique({ where: { tokenHash } });
    if (!found || found.type !== type || found.usedAt || found.expiresAt.getTime() < Date.now())
        return null;
    // updateMany conditionnel : deux requêtes simultanées ne peuvent pas consommer le même jeton.
    const { count } = await prisma_1.prisma.authToken.updateMany({
        where: { id: found.id, usedAt: null },
        data: { usedAt: new Date() },
    });
    return count === 1 ? found.userId : null;
}
/** Délai minimal entre deux e-mails du même type, en secondes (anti-spam). */
async function secondsUntilResend(userId, type, cooldownSec = 60) {
    const last = await prisma_1.prisma.authToken.findFirst({ where: { userId, type }, orderBy: { createdAt: "desc" } });
    if (!last)
        return 0;
    const wait = cooldownSec - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
    return Math.max(wait, 0);
}
