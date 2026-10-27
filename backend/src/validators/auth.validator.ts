import { z } from "zod";

const email = z
  .string({ error: "Email invalide" })
  .trim()
  .toLowerCase()
  .max(254, "Email invalide")
  .email("Email invalide");

// bcrypt ignore silencieusement tout ce qui dépasse 72 octets : on refuse plutôt que de tronquer.
const pasTropLong = (v: string) => Buffer.byteLength(v, "utf8") <= 72;

export const registerSchema = z.object({
  email,
  phone: z
    .string({ error: "Numéro invalide" })
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(/^\+?[0-9]{9,15}$/, "Numéro invalide")),
  password: z
    .string({ error: "Le mot de passe est obligatoire" })
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .refine(pasTropLong, "Le mot de passe est trop long (72 octets maximum)"),
});

export const loginSchema = z.object({
  email,
  password: z
    .string({ error: "Mot de passe invalide" })
    .min(8, "Mot de passe invalide")
    .refine(pasTropLong, "Mot de passe invalide"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;