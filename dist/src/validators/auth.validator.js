"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
const email = zod_1.z
    .string({ error: "Email invalide" })
    .trim()
    .toLowerCase()
    .max(254, "Email invalide")
    .email("Email invalide");
// bcrypt ignore silencieusement tout ce qui dépasse 72 octets : on refuse plutôt que de tronquer.
const pasTropLong = (v) => Buffer.byteLength(v, "utf8") <= 72;
exports.registerSchema = zod_1.z.object({
    email,
    phone: zod_1.z
        .string({ error: "Numéro invalide" })
        .trim()
        .transform((v) => v.replace(/[\s.-]/g, ""))
        .pipe(zod_1.z.string().regex(/^\+?[0-9]{9,15}$/, "Numéro invalide")),
    password: zod_1.z
        .string({ error: "Le mot de passe est obligatoire" })
        .min(8, "Le mot de passe doit contenir au moins 8 caractères")
        .refine(pasTropLong, "Le mot de passe est trop long (72 octets maximum)"),
});
exports.loginSchema = zod_1.z.object({
    email,
    password: zod_1.z
        .string({ error: "Mot de passe invalide" })
        .min(8, "Mot de passe invalide")
        .refine(pasTropLong, "Mot de passe invalide"),
});
