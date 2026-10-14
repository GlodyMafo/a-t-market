import { z } from "zod";

// Variable texte obligatoire, avec un message clair en français
const requis = (nom: string) =>
  z
    .string({ error: `${nom} est obligatoire` })
    .min(1, `${nom} ne peut pas être vide`);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: requis("DATABASE_URL"),

  JWT_SECRET: requis("JWT_SECRET").min(
    16,
    "JWT_SECRET doit contenir au moins 16 caractères"
  ),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),

  PAWAPAY_API_KEY: requis("PAWAPAY_API_KEY"),
  PAWAPAY_BASE_URL: requis("PAWAPAY_BASE_URL").url(
    "PAWAPAY_BASE_URL doit être une URL valide"
  ),
  PAWAPAY_DEPOSIT_CALLBACK_URL: requis("PAWAPAY_DEPOSIT_CALLBACK_URL").url(
    "PAWAPAY_DEPOSIT_CALLBACK_URL doit être une URL valide"
  ),
  PAWAPAY_WEBHOOK_SECRET: z.string().optional(),
  APIFY_API_TOKEN: requis("APIFY_API_TOKEN"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuration invalide. Corrige ton fichier .env :");
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join(".")} : ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;