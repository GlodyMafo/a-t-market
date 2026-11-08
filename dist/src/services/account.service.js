"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAddresses = exports.USER_SELECT = void 0;
exports.sendVerificationEmail = sendVerificationEmail;
exports.resendVerification = resendVerification;
exports.verifyEmail = verifyEmail;
exports.requestPasswordReset = requestPasswordReset;
exports.resetPassword = resetPassword;
exports.changePassword = changePassword;
exports.updateProfile = updateProfile;
exports.createAddress = createAddress;
exports.updateAddress = updateAddress;
exports.deleteAddress = deleteAddress;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../lib/prisma");
const authToken_service_1 = require("./authToken.service");
const auth_email_service_1 = require("./auth.email.service");
const appError_1 = require("../utils/appError");
exports.USER_SELECT = {
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
};
const MAX_ADDRESSES = 10;
async function sendVerificationEmail(userId, email) {
    const raw = await (0, authToken_service_1.issueToken)(userId, "EMAIL_VERIFICATION");
    return (0, auth_email_service_1.sendAuthEmail)("VERIFY_EMAIL", email, raw);
}
async function resendVerification(userId) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
    if (!user)
        throw new appError_1.NotFoundError("Compte introuvable");
    if (user.emailVerifiedAt)
        throw new Error("Votre adresse e-mail est déjà vérifiée");
    const wait = await (0, authToken_service_1.secondsUntilResend)(userId, "EMAIL_VERIFICATION");
    if (wait > 0)
        throw new Error(`Patientez ${wait} secondes avant de redemander un e-mail`);
    const sent = await sendVerificationEmail(userId, user.email);
    if (!sent)
        throw new Error("L'e-mail n'a pas pu être envoyé. Réessayez plus tard.");
}
async function verifyEmail(rawToken) {
    const userId = await (0, authToken_service_1.consumeToken)(rawToken, "EMAIL_VERIFICATION");
    if (!userId)
        throw new Error("Ce lien est invalide ou a expiré");
    await prisma_1.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
}
/** Répond toujours de la même façon : ne révèle jamais si l'adresse a un compte. */
async function requestPasswordReset(email) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user)
        return;
    if ((await (0, authToken_service_1.secondsUntilResend)(user.id, "PASSWORD_RESET", 60)) > 0)
        return;
    const raw = await (0, authToken_service_1.issueToken)(user.id, "PASSWORD_RESET");
    await (0, auth_email_service_1.sendAuthEmail)("RESET_PASSWORD", user.email, raw);
}
async function resetPassword(rawToken, password) {
    const userId = await (0, authToken_service_1.consumeToken)(rawToken, "PASSWORD_RESET");
    if (!userId)
        throw new Error("Ce lien est invalide ou a expiré");
    const hashed = await bcrypt_1.default.hash(password, 10);
    await prisma_1.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    // Recevoir l'e-mail prouve aussi la possession de l'adresse.
    await prisma_1.prisma.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
}
async function changePassword(userId, currentPassword, newPassword) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user)
        throw new appError_1.NotFoundError("Compte introuvable");
    if (!(await bcrypt_1.default.compare(currentPassword, user.password)))
        throw new Error("Mot de passe actuel incorrect");
    await prisma_1.prisma.user.update({ where: { id: userId }, data: { password: await bcrypt_1.default.hash(newPassword, 10) } });
}
async function updateProfile(userId, data) {
    const { birthDate, phone, ...rest } = data;
    if (phone) {
        const other = await prisma_1.prisma.user.findFirst({ where: { phone, NOT: { id: userId } }, select: { id: true } });
        if (other)
            throw new Error("Ce numéro est déjà utilisé");
    }
    return prisma_1.prisma.user.update({
        where: { id: userId },
        data: {
            ...rest,
            ...(phone !== undefined ? { phone } : {}),
            ...(birthDate !== undefined ? { birthDate: birthDate === null ? null : new Date(`${birthDate}T00:00:00Z`) } : {}),
        },
        select: exports.USER_SELECT,
    });
}
// ---------- Adresses ----------
const listAddresses = (userId) => prisma_1.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
exports.listAddresses = listAddresses;
async function createAddress(userId, input) {
    return prisma_1.prisma.$transaction(async (tx) => {
        const count = await tx.address.count({ where: { userId } });
        if (count >= MAX_ADDRESSES)
            throw new Error(`Vous pouvez enregistrer ${MAX_ADDRESSES} adresses au maximum`);
        const makeDefault = input.isDefault === true || count === 0;
        if (makeDefault)
            await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
        return tx.address.create({ data: { ...input, isDefault: makeDefault, userId } });
    });
}
async function updateAddress(userId, addressId, input) {
    return prisma_1.prisma.$transaction(async (tx) => {
        const found = await tx.address.findFirst({ where: { id: addressId, userId } });
        if (!found)
            throw new appError_1.NotFoundError("Adresse introuvable");
        if (input.isDefault === true)
            await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
        // Une adresse par défaut ne peut pas être « désactivée » directement : on en choisit une autre.
        const { isDefault, ...rest } = input;
        return tx.address.update({ where: { id: addressId }, data: { ...rest, ...(isDefault === true ? { isDefault: true } : {}) } });
    });
}
async function deleteAddress(userId, addressId) {
    await prisma_1.prisma.$transaction(async (tx) => {
        const found = await tx.address.findFirst({ where: { id: addressId, userId } });
        if (!found)
            throw new appError_1.NotFoundError("Adresse introuvable");
        await tx.address.delete({ where: { id: addressId } });
        if (found.isDefault) {
            const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
            if (next)
                await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
        }
    });
}
