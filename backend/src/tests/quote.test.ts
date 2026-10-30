import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerReglages, creerSousCategorie, creerUtilisateur } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import { createInternationalQuote } from "../services/internationalQuote.service";
import { getPendingQuotes } from "../services/internationalQuote.admin.service";
import { initializeSettings, updateSettings } from "../services/settings.service";

before(async () => {
  await startTestDb();
});
after(async () => {
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
});

const URL_PRODUIT = "https://www.shein.com/x-p-1.html";

// =============== Création de devis ===============

test("Poids du catalogue : devis AUTO_APPROVED, montants exacts (20 $ + 0,5 kg = 38 $)", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T-shirt", 20, sub.id);

  assert.equal(q.status, "AUTO_APPROVED");
  assert.equal(q.totalPrice.toString(), "38");
  assert.equal(q.shippingCost.toString(), "7");
  assert.equal(q.commissionCost.toString(), "3");
  assert.equal(q.customsCost.toString(), "0");
  assert.equal(q.productWeight?.toString(), "0.5");
  assert.equal(q.adminNotes, null);
});

test("Sous-catégorie sans poids au catalogue : PENDING_REVIEW, poids null (jamais 0), provisoire", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie();

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "Robe", 20, sub.id);

  assert.equal(q.status, "PENDING_REVIEW");
  assert.equal(q.productWeight, null);
  assert.equal(q.shippingCost.toString(), "0");
  assert.match(q.adminNotes ?? "", /provisoire/);
});

test("Poids extrait du site : prioritaire sur le catalogue", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "Sac", 20, sub.id, 2);

  assert.equal(q.productWeight?.toString(), "2");
  assert.equal(q.shippingCost.toString(), "28");
  assert.equal(q.status, "AUTO_APPROVED");
});

test("Les montants stockés suivent les réglages de la base (pas de valeurs en dur)", async () => {
  await creerReglages({ commission: "10", perKg: "12", fee: "5" });
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id);

  assert.equal(q.totalPrice.toString(), "33");
});

test("Arrondi stocké : 10,10 $ + 1 kg -> commission 1,52 et total cohérent", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "1" });

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 10.1, sub.id);

  assert.equal(q.commissionCost.toString(), "1.52");
  assert.equal(q.totalPrice.toString(), "33.62"); // 10.10 + 14 + 1.52 + 8
});

test("Sous-catégorie inconnue ou inactive refusée", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const inactive = await creerSousCategorie({ weightKg: "1", active: false });

  await assert.rejects(
    createInternationalQuote(user.id, URL_PRODUIT, "T", 20, "inexistante"),
    /invalide ou inactive/
  );
  await assert.rejects(
    createInternationalQuote(user.id, URL_PRODUIT, "T", 20, inactive.id),
    /invalide ou inactive/
  );
  assert.equal(await prisma.internationalQuote.count(), 0);
});

test("Prix ou poids invalides refusés, aucun devis créé", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "1" });

  for (const prix of [0, -3, NaN]) {
    await assert.rejects(createInternationalQuote(user.id, URL_PRODUIT, "T", prix, sub.id), /prix/);
  }
  await assert.rejects(createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id, -2), /poids/);
  await assert.rejects(createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id, 0), /poids/);
  assert.equal(await prisma.internationalQuote.count(), 0);
});

test("Sans réglages en base : erreur claire, aucun devis", async () => {
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "1" });

  await assert.rejects(
    createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id),
    /Configuration système introuvable/
  );
});

// =============== Fuite de données ===============

test("Devis en attente (vue admin) : le hash du mot de passe n'est JAMAIS renvoyé", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie();
  await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id);

  const pending = await getPendingQuotes();

  assert.equal(pending.length, 1);
  assert.ok(pending[0].user.email);
  assert.equal("password" in pending[0].user, false);
  assert.equal(JSON.stringify(pending).includes("password"), false);
});

// =============== Réglages ===============

test("Réglages initiaux : 15 % / 14 $ par kg / 8 $", async () => {
  const s = await initializeSettings();
  assert.equal(s.commissionRate.toString(), "15");
  assert.equal(s.chinaPricePerKg.toString(), "14");
  assert.equal(s.fixedFee.toString(), "8");
  assert.equal(s.aedToUsdRate, null);

});

test("L'initialisation n'écrase JAMAIS des réglages existants", async () => {
  await creerReglages({ commission: "20", perKg: "9", fee: "3" });

  const s = await initializeSettings();

  assert.equal(s.commissionRate.toString(), "20");
  assert.equal(await prisma.globalSettings.count(), 1);
});

test("Modification valide des réglages", async () => {
  await creerReglages();

  const s = await updateSettings({ commissionRate: 12.5 });

  assert.equal(s.commissionRate.toString(), "12.5");
  assert.equal(s.chinaPricePerKg.toString(), "14"); // inchangé
});

test("Réglages invalides refusés, base inchangée", async () => {
  await creerReglages();

  const invalides: unknown[] = [
    { commissionRate: -1 },
    { commissionRate: 101 },
    { commissionRate: 1500 },
    { chinaPricePerKg: 0 },
    { chinaPricePerKg: -14 },
    { chinaPricePerKg: 501 },
    { fixedFee: -1 },
    { fixedFee: 1001 },
    { commissionRate: "15" },
    { commissionRate: NaN },
    { commissionRate: null },
    { id: "autre", commissionRate: 15 },
    { createdAt: "2000-01-01" },
    { aedToUsdRate: 0 },
    { aedToUsdRate: -0.27 },
    { aedToUsdRate: 10.1 },
    { aedToUsdRate: "0.27" },
    { aedToUsdRate: null },
    {},
    null,
    "texte",
    [],
  ];

  for (const body of invalides) {
    await assert.rejects(updateSettings(body), /Réglages invalides|Aucun réglage/, JSON.stringify(body));
  }
  const s = await prisma.globalSettings.findFirstOrThrow();
  assert.equal(s.commissionRate.toString(), "15");
});

test("Modification du taux AED vers USD", async () => {
  await creerReglages();

  const s = await updateSettings({ aedToUsdRate: 0.27 });

  assert.equal(s.aedToUsdRate?.toString(), "0.27");
  assert.equal(s.commissionRate.toString(), "15");
});