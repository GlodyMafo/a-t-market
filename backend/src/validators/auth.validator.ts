import { z } from "zod";

export const registerSchema = z.object({

  email: z
    .string()
    .email("Email invalide"),

  phone: z
    .string()
    .min(9, "Numéro invalide"),

  password: z
    .string()
    .min(
      8,
      "Le mot de passe doit contenir au moins 8 caractères"
    )

});

export const loginSchema = z.object({

  email: z
    .string()
    .email("Email invalide"),

  password: z
    .string()
    .min(
      8,
      "Mot de passe invalide"
    )

});

export type RegisterInput =
  z.infer<typeof registerSchema>;

export type LoginInput =
  z.infer<typeof loginSchema>;