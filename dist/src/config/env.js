"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
// Variable texte obligatoire, avec un message clair en français
const requis = (nom) => zod_1.z
    .string({ error: `${nom} est obligatoire` })
    .min(1, `${nom} ne peut pas être vide`);
// Une variable laissée vide dans le .env (ex. « ADMIN_NOTIFICATION_EMAIL= ») équivaut à « non définie ».
const vide = (schema) => zod_1.z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: zod_1.z.coerce.number().int().positive().default(5000),
    DATABASE_URL: requis("DATABASE_URL"),
    JWT_SECRET: requis("JWT_SECRET").min(16, "JWT_SECRET doit contenir au moins 16 caractères"),
    JWT_EXPIRES_IN: zod_1.z.string().min(1).default("7d"),
    PAWAPAY_API_KEY: requis("PAWAPAY_API_KEY"),
    PAWAPAY_BASE_URL: requis("PAWAPAY_BASE_URL").url("PAWAPAY_BASE_URL doit être une URL valide"),
    PAWAPAY_DEPOSIT_CALLBACK_URL: requis("PAWAPAY_DEPOSIT_CALLBACK_URL").url("PAWAPAY_DEPOSIT_CALLBACK_URL doit être une URL valide"),
    APIFY_API_TOKEN: requis("APIFY_API_TOKEN"),
    // Nombre de proxys devant le serveur (1 sur Render) : nécessaire pour lire la vraie IP des visiteurs.
    TRUST_PROXY_HOPS: zod_1.z.coerce.number().int().min(0).max(5).default(0),
    // Domaines du frontend autorisés à appeler l'API, séparés par des virgules.
    // Exemple : https://at-market.vercel.app,https://www.atmarket.cd
    CORS_ORIGINS: zod_1.z.string().optional(),
    // ---------- E-mail (Gmail SMTP) : tout ou rien ----------
    SMTP_HOST: vide(zod_1.z.string().min(1)),
    SMTP_PORT: vide(zod_1.z.coerce.number().int().min(1).max(65535)),
    SMTP_SECURE: vide(zod_1.z.enum(["true", "false"], { error: "SMTP_SECURE doit valoir true ou false" })),
    SMTP_USER: vide(zod_1.z.string().min(1)),
    SMTP_PASSWORD: vide(zod_1.z.string().min(1)),
    SMTP_FROM_NAME: vide(zod_1.z.string().min(1)),
    SMTP_FROM_EMAIL: vide(zod_1.z.email("SMTP_FROM_EMAIL doit être une adresse e-mail valide")),
    // Adresse du site (sans chemin) : sert uniquement à mettre un lien dans les e-mails.
    FRONTEND_URL: vide(zod_1.z.url("FRONTEND_URL doit être une URL valide")),
    // Destinataire des alertes administrateur. Vide = aucune alerte.
    ADMIN_NOTIFICATION_EMAIL: vide(zod_1.z.email("ADMIN_NOTIFICATION_EMAIL doit être une adresse e-mail valide")),
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
        if (new URL(origine).origin !== origine)
            throw new Error();
    }
    catch {
        console.error(`Configuration invalide : CORS_ORIGINS contient « ${origine} » (attendu : https://domaine.tld, sans chemin).`);
        process.exit(1);
    }
}
if (parsed.data.NODE_ENV === "production" && origines.length === 0) {
    console.error("Configuration invalide : CORS_ORIGINS est obligatoire en production.");
    process.exit(1);
}
// ---------- Validation de la configuration e-mail ----------
const d = parsed.data;
const SMTP_CLES = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM_NAME",
    "SMTP_FROM_EMAIL",
];
const renseignees = SMTP_CLES.filter((k) => d[k] !== undefined);
const manquantes = SMTP_CLES.filter((k) => d[k] === undefined);
if (renseignees.length > 0 && manquantes.length > 0) {
    console.error(`Configuration invalide : l'e-mail est partiellement configuré. Variables manquantes : ${manquantes.join(", ")}.`);
    process.exit(1);
}
if (renseignees.length === 0 && d.NODE_ENV === "production") {
    console.error("Configuration invalide : la configuration SMTP est obligatoire en production.");
    process.exit(1);
}
const smtpSecure = d.SMTP_SECURE === "true";
if (d.SMTP_PORT === 465 && !smtpSecure) {
    console.error("Configuration invalide : le port 465 exige SMTP_SECURE=true.");
    process.exit(1);
}
if (d.SMTP_PORT === 587 && smtpSecure) {
    console.error("Configuration invalide : le port 587 (STARTTLS) exige SMTP_SECURE=false.");
    process.exit(1);
}
const frontendUrl = d.FRONTEND_URL?.replace(/\/+$/, "");
if (frontendUrl) {
    try {
        if (new URL(frontendUrl).origin !== frontendUrl)
            throw new Error();
    }
    catch {
        console.error("Configuration invalide : FRONTEND_URL doit être de la forme https://domaine.tld, sans chemin.");
        process.exit(1);
    }
}
// Les variables SMTP brutes ne sont pas conservées dans `env` : tout passe par l'objet `SMTP` ci-dessous.
const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_NAME, SMTP_FROM_EMAIL, FRONTEND_URL: _frontendBrut, ...reste } = parsed.data;
exports.env = {
    ...reste,
    // Hors production, le frontend Next.js local est autorisé par défaut.
    CORS_ALLOWED_ORIGINS: origines.length > 0 ? origines : ["http://localhost:3000", "http://127.0.0.1:3000"],
    FRONTEND_URL: frontendUrl,
    // null = e-mail désactivé (développement sans compte Gmail).
    SMTP: renseignees.length === 0
        ? null
        : {
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: smtpSecure,
            user: SMTP_USER,
            password: SMTP_PASSWORD,
            fromName: SMTP_FROM_NAME,
            fromEmail: SMTP_FROM_EMAIL,
        },
};
