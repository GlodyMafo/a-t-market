"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addressIdParams = exports.updateAddressSchema = exports.addressSchema = exports.updateProfileSchema = exports.changePasswordSchema = exports.resetPasswordSchema = exports.tokenSchema = exports.emailSchema = void 0;
const zod_1 = require("zod");
const common_validator_1 = require("./common.validator");
const pasTropLong = (v) => Buffer.byteLength(v, "utf8") <= 72;
const motDePasse = zod_1.z
    .string({ error: "Le mot de passe est obligatoire" })
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .refine(pasTropLong, "Le mot de passe est trop long (72 octets maximum)");
const texte = (label, max = 100) => zod_1.z.string({ error: `${label} invalide` }).trim().min(1, `${label} est obligatoire`).max(max, `${label} est trop long`);
const telephone = zod_1.z
    .string({ error: "Numéro invalide" })
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .pipe(zod_1.z.string().regex(/^\+?[0-9]{9,15}$/, "Numéro invalide"));
exports.emailSchema = zod_1.z
    .object({ email: zod_1.z.string({ error: "Email invalide" }).trim().toLowerCase().max(254, "Email invalide").email("Email invalide") })
    .strict();
exports.tokenSchema = zod_1.z.object({ token: zod_1.z.string({ error: "Lien invalide" }).min(20, "Lien invalide").max(200, "Lien invalide") }).strict();
exports.resetPasswordSchema = zod_1.z.object({ token: exports.tokenSchema.shape.token, password: motDePasse }).strict();
exports.changePasswordSchema = zod_1.z
    .object({ currentPassword: zod_1.z.string({ error: "Mot de passe actuel invalide" }).min(1, "Mot de passe actuel invalide").max(200), newPassword: motDePasse })
    .strict();
exports.updateProfileSchema = zod_1.z
    .object({
    firstName: texte("Le prénom", 60).nullable().optional(),
    lastName: texte("Le nom", 60).nullable().optional(),
    phone: telephone.optional(),
    birthDate: zod_1.z
        .string({ error: "Date invalide" })
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
        .refine((v) => {
        const d = new Date(`${v}T00:00:00Z`);
        return !Number.isNaN(d.getTime()) && d <= new Date() && d.getUTCFullYear() >= 1900;
    }, "Date invalide")
        .nullable()
        .optional(),
    gender: zod_1.z.enum(["FEMALE", "MALE"], { error: "Genre invalide" }).nullable().optional(),
})
    .strict()
    .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");
exports.addressSchema = zod_1.z
    .object({
    label: texte("Le libellé", 40).nullable().optional(),
    fullName: texte("Le nom du destinataire", 100),
    phone: telephone,
    city: texte("La ville", 80),
    commune: texte("La commune", 80).nullable().optional(),
    neighborhood: texte("Le quartier", 100),
    street: texte("L'avenue / la rue", 150),
    landmark: texte("Le point de repère", 150).nullable().optional(),
    isDefault: zod_1.z.boolean().optional(),
})
    .strict();
exports.updateAddressSchema = exports.addressSchema
    .partial()
    .strict()
    .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");
exports.addressIdParams = zod_1.z.object({ addressId: common_validator_1.id }).strict();
