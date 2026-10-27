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
  // Nombre de proxys devant le serveur (1 sur Render) : nécessaire pour lire la vraie IP des visiteurs.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Domaines du frontend autorisés à appeler l'API, séparés par des virgules.
  // Exemple : https://at-market.vercel.app,https://www.atmarket.cd
  CORS_ORIGINS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuration invalide. Corrige ton fichier .env :");
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join(".")} : ${issue.message}`);
  }
  process.exit(1);
}

const origines = (parsed.data.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

for (const origine of origines) {
  try {
    if (new URL(origine).origin !== origine) throw new Error();
  } catch {
    console.error(`Configuration invalide : CORS_ORIGINS contient « ${origine} » (attendu : https://domaine.tld, sans chemin).`);
    process.exit(1);
  }
}

if (parsed.data.NODE_ENV === "production" && origines.length === 0) {
  console.error("Configuration invalide : CORS_ORIGINS est obligatoire en production.");
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // Hors production, le frontend Next.js local est autorisé par défaut.
  CORS_ALLOWED_ORIGINS:
    origines.length > 0 ? origines : ["http://localhost:3000", "http://127.0.0.1:3000"],
};