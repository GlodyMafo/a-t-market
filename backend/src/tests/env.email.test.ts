import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

// Ce test n'a besoin d'aucune base de données : il lance config/env.ts dans un sous-processus,
// car ce fichier appelle process.exit() quand la configuration est invalide.

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(__dirname, "helpers", "loadEnv.ts");
const MOT_DE_PASSE = "motdepasse-secret-0123";

const CLES_A_NETTOYER = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM_NAME",
  "SMTP_FROM_EMAIL",
  "FRONTEND_URL",
  "ADMIN_NOTIFICATION_EMAIL",
  "CORS_ORIGINS",
];

const BASE = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/x",
  JWT_SECRET: "secret-de-test-0123456789",
  PAWAPAY_API_KEY: "test",
  PAWAPAY_BASE_URL: "http://127.0.0.1:1",
  PAWAPAY_DEPOSIT_CALLBACK_URL: "http://127.0.0.1:1/callback",
  APIFY_API_TOKEN: "test",
};

const SMTP_OK = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "test@example.com",
  SMTP_PASSWORD: MOT_DE_PASSE,
  SMTP_FROM_NAME: "AT-MARKET",
  SMTP_FROM_EMAIL: "test@example.com",
};

function lancer(extra: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const cle of CLES_A_NETTOYER) delete env[cle];
  Object.assign(env, BASE, extra);

  const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });

  const sortie = r.stdout ?? "";
  const erreur = r.stderr ?? "";

  // Règle transversale : le mot de passe ne sort jamais, ni en succès ni en échec.
  assert.equal(sortie.includes(MOT_DE_PASSE), false, "mot de passe présent dans stdout");
  assert.equal(erreur.includes(MOT_DE_PASSE), false, "mot de passe présent dans stderr");

  return { code: r.status, sortie, erreur };
}

test("Sans aucune variable SMTP en développement : le serveur démarre, e-mail désactivé", () => {
  const r = lancer();
  assert.equal(r.code, 0, r.erreur);
  assert.deepEqual(JSON.parse(r.sortie), { smtp: false, frontend: null });
});

test("Configuration SMTP complète : e-mail activé", () => {
  const r = lancer(SMTP_OK);
  assert.equal(r.code, 0, r.erreur);
  assert.equal(JSON.parse(r.sortie).smtp, true);
});

test("Configuration SMTP partielle : refus avec la liste des variables manquantes", () => {
  const r = lancer({ SMTP_HOST: "smtp.gmail.com", SMTP_PASSWORD: MOT_DE_PASSE });
  assert.equal(r.code, 1);
  assert.match(r.erreur, /partiellement configuré/);
  assert.match(r.erreur, /SMTP_USER/);
  assert.match(r.erreur, /SMTP_FROM_EMAIL/);
});

test("Production sans SMTP : refus", () => {
  const r = lancer({ NODE_ENV: "production", CORS_ORIGINS: "https://at-market.vercel.app" });
  assert.equal(r.code, 1);
  assert.match(r.erreur, /SMTP est obligatoire en production/);
});

test("Production avec SMTP complet : accepté", () => {
  const r = lancer({
    ...SMTP_OK,
    NODE_ENV: "production",
    CORS_ORIGINS: "https://at-market.vercel.app",
  });
  assert.equal(r.code, 0, r.erreur);
});

test("Port 587 avec SMTP_SECURE=true : refus explicite", () => {
  const r = lancer({ ...SMTP_OK, SMTP_SECURE: "true" });
  assert.equal(r.code, 1);
  assert.match(r.erreur, /587/);
});

test("Port 465 avec SMTP_SECURE=false : refus explicite", () => {
  const r = lancer({ ...SMTP_OK, SMTP_PORT: "465", SMTP_SECURE: "false" });
  assert.equal(r.code, 1);
  assert.match(r.erreur, /465/);
});

test("SMTP_FROM_EMAIL invalide : refus", () => {
  const r = lancer({ ...SMTP_OK, SMTP_FROM_EMAIL: "pas-un-email" });
  assert.equal(r.code, 1);
  assert.match(r.erreur, /SMTP_FROM_EMAIL/);
});

test("FRONTEND_URL : le slash final est retiré, un chemin est refusé", () => {
  const ok = lancer({ FRONTEND_URL: "https://at-market.vercel.app/" });
  assert.equal(ok.code, 0, ok.erreur);
  assert.equal(JSON.parse(ok.sortie).frontend, "https://at-market.vercel.app");

  const ko = lancer({ FRONTEND_URL: "https://at-market.vercel.app/boutique" });
  assert.equal(ko.code, 1);
  assert.match(ko.erreur, /FRONTEND_URL/);
});

test("Variables facultatives laissées vides dans le .env : acceptées", () => {
  const r = lancer({ ADMIN_NOTIFICATION_EMAIL: "", FRONTEND_URL: "", SMTP_HOST: "" });
  assert.equal(r.code, 0, r.erreur);
});

test("ADMIN_NOTIFICATION_EMAIL invalide : refus", () => {
  const r = lancer({ ADMIN_NOTIFICATION_EMAIL: "pas-un-email" });
  assert.equal(r.code, 1);
  assert.match(r.erreur, /ADMIN_NOTIFICATION_EMAIL/);
});