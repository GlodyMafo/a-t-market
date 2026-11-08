"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.getCurrentUser = getCurrentUser;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../utils/jwt");
const account_service_1 = require("./account.service");
// Hash factice : on compare toujours un mot de passe, même si l'email est inconnu,
// pour que la durée de réponse ne révèle pas quels emails ont un compte.
const HASH_FACTICE = "$2b$10$oJgQV632JIPIw4XHYA3HguTF8nBN1Pdomiu8hqlLmpyMeyzil3ywe";
async function register(data) {
    const { email, password, phone } = data;
    const existingUser = await prisma_1.prisma.user.findUnique({
        where: {
            email
        }
    });
    if (existingUser) {
        throw new Error("Cet email est déjà utilisé");
    }
    if (phone) {
        const existingPhone = await prisma_1.prisma.user.findUnique({
            where: {
                phone
            }
        });
        if (existingPhone) {
            throw new Error("Ce numéro est déjà utilisé");
        }
    }
    const hashedPassword = await bcrypt_1.default.hash(password, 10);
    const user = await prisma_1.prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            phone
        }
    })
        .catch((error) => {
        // Deux inscriptions simultanées avec le même email ou numéro.
        if (error?.code === "P2002") {
            throw new Error("Cet email ou ce numéro est déjà utilisé");
        }
        throw error;
    });
    const token = (0, jwt_1.generateToken)({
        userId: user.id,
        role: user.role
    });
    // L'inscription ne dépend jamais de l'envoi de l'e-mail.
    void (0, account_service_1.sendVerificationEmail)(user.id, user.email).catch(() => undefined);
    return {
        user: {
            id: user.id,
            email: user.email,
            phone: user.phone,
            role: user.role
        },
        token,
    };
}
async function login(data) {
    const { email, password } = data;
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            email
        }
    });
    if (!user) {
        await bcrypt_1.default.compare(password, HASH_FACTICE);
        throw new Error("Identifiants invalides");
    }
    const passwordMatch = await bcrypt_1.default.compare(password, user.password);
    if (!passwordMatch) {
        throw new Error("Identifiants invalides");
    }
    const token = (0, jwt_1.generateToken)({
        userId: user.id,
        role: user.role
    });
    return {
        user: {
            id: user.id,
            email: user.email,
            phone: user.phone,
            role: user.role
        },
        token
    };
}
async function getCurrentUser(userId) {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            id: userId
        },
        select: account_service_1.USER_SELECT
    });
    if (!user) {
        throw new Error("Utilisateur introuvable");
    }
    return user;
}
