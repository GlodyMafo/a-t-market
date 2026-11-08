import { z } from "zod";
import { id } from "./common.validator";

const pasTropLong = (v: string) => Buffer.byteLength(v, "utf8") <= 72;
const motDePasse = z
  .string({ error: "Le mot de passe est obligatoire" })
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .refine(pasTropLong, "Le mot de passe est trop long (72 octets maximum)");

const texte = (label: string, max = 100) =>
  z.string({ error: `${label} invalide` }).trim().min(1, `${label} est obligatoire`).max(max, `${label} est trop long`);

const telephone = z
  .string({ error: "Numéro invalide" })
  .trim()
  .transform((v) => v.replace(/[\s.-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{9,15}$/, "Numéro invalide"));

export const emailSchema = z
  .object({ email: z.string({ error: "Email invalide" }).trim().toLowerCase().max(254, "Email invalide").email("Email invalide") })
  .strict();

export const tokenSchema = z.object({ token: z.string({ error: "Lien invalide" }).min(20, "Lien invalide").max(200, "Lien invalide") }).strict();

export const resetPasswordSchema = z.object({ token: tokenSchema.shape.token, password: motDePasse }).strict();

export const changePasswordSchema = z
  .object({ currentPassword: z.string({ error: "Mot de passe actuel invalide" }).min(1, "Mot de passe actuel invalide").max(200), newPassword: motDePasse })
  .strict();

export const updateProfileSchema = z
  .object({
    firstName: texte("Le prénom", 60).nullable().optional(),
    lastName: texte("Le nom", 60).nullable().optional(),
    phone: telephone.optional(),
    birthDate: z
      .string({ error: "Date invalide" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
      .refine((v) => {
        const d = new Date(`${v}T00:00:00Z`);
        return !Number.isNaN(d.getTime()) && d <= new Date() && d.getUTCFullYear() >= 1900;
      }, "Date invalide")
      .nullable()
      .optional(),
    gender: z.enum(["FEMALE", "MALE"], { error: "Genre invalide" }).nullable().optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");

export const addressSchema = z
  .object({
    label: texte("Le libellé", 40).nullable().optional(),
    fullName: texte("Le nom du destinataire", 100),
    phone: telephone,
    city: texte("La ville", 80),
    commune: texte("La commune", 80).nullable().optional(),
    neighborhood: texte("Le quartier", 100),
    street: texte("L'avenue / la rue", 150),
    landmark: texte("Le point de repère", 150).nullable().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const updateAddressSchema = addressSchema
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");

export const addressIdParams = z.object({ addressId: id }).strict();