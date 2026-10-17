import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import {
  creerAdmin,
  creerReglages,
  creerSousCategorie,
  creerUtilisateur,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import {
  createInternationalQuote,
  isQuotePayable,
} from "../services/internationalQuote.service";
import {
  approveQuote,
  rejectQuote,
  getQuoteHistory,
} from "../services/internationalQuote.admin.service";

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

/** Devis à 20 $ ; sans poids au catalogue => PENDING_REVIEW (provisoire : 20 + 0 + 3 + 8 = 31 $). */
async function devisEnAttente() {
  await creerReglages();
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const sub = await creerSousCategorie();
  const quote = await createInternationalQuote(user.id, URL_PRODUIT, "Robe", 20, sub.id);
  return { user, admin, sub, quote };
}

// =============== Traçabilité à la création ===============

test("Poids du catalogue : source CATALOG_ESTIMATE, devise et taux conservés", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id);

  assert.equal(q.weightSource, "CATALOG_ESTIMATE");
  assert.equal(q.currency, "USD");
  assert.equal(q.commissionRate?.toString(), "15");
  assert.equal(q.chinaPricePerKg?.toString(), "14");
  assert.equal(q.fixedFee?.toString(), "8");
});

test("Poids extrait : source EXTRACTED", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id, 1.2);

  assert.equal(q.weightSource, "EXTRACTED");
});

test("Poids inconnu : aucune source (jamais présenté comme réel ni estimé)", async () => {
  const { quote } = await devisEnAttente();
  assert.equal(quote.weightSource, null);
  assert.equal(quote.productWeight, null);
});

test("Poids extrait avec 3 décimales : arrondi au 10 g supérieur AVANT le calcul (poids stocké = poids utilisé)", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie();

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id, 0.275);

  assert.equal(q.productWeight?.toString(), "0.28");
  assert.equal(q.shippingCost.toString(), "3.92"); // 0.28 x 14
  assert.equal(q.totalPrice.toString(), "34.92"); // 20 + 3.92 + 3 + 8
});

test("Un très petit poids positif n'est jamais ramené à 0 kg", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie();

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id, 0.001);

  assert.equal(q.productWeight?.toString(), "0.01");
});

// =============== Approbation ===============

test("Approbation avec poids admin : devis APPROVED, montant définitif, source ADMIN", async () => {
  const { admin, quote } = await devisEnAttente();
  assert.equal(quote.totalPrice.toString(), "31");

  const approved = await approveQuote(quote.id, admin.id, { weightKg: 0.5, adminNotes: "Poids pesé" });

  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.productWeight?.toString(), "0.5");
  assert.equal(approved.weightSource, "ADMIN");
  assert.equal(approved.shippingCost.toString(), "7");
  assert.equal(approved.commissionCost.toString(), "3");
  assert.equal(approved.totalPrice.toString(), "38");
  assert.equal(approved.adminNotes, "Poids pesé");
});

test("L'ancien montant provisoire n'est JAMAIS perdu : il reste dans l'historique", async () => {
  const { admin, quote } = await devisEnAttente();

  await approveQuote(quote.id, admin.id, { weightKg: 0.5 });
  const history = await getQuoteHistory(quote.id);

  assert.equal(history.length, 1);
  const rev = history[0];
  assert.equal(rev.action, "APPROVED");
  assert.equal(rev.adminId, admin.id);
  const before = rev.snapshotBefore as Record<string, unknown>;
  const after = rev.snapshotAfter as Record<string, unknown>;
  assert.equal(before.status, "PENDING_REVIEW");
  assert.equal(before.totalPrice, "31");
  assert.equal(before.productWeight, null);
  assert.equal(after.status, "APPROVED");
  assert.equal(after.totalPrice, "38");
  assert.equal(after.weightSource, "ADMIN");
});

test("Le montant définitif est recalculé avec les réglages ACTUELS, et leurs taux sont conservés", async () => {
  const { admin, quote } = await devisEnAttente();
  await prisma.globalSettings.updateMany({
    data: { commissionRate: "10", chinaPricePerKg: "12", fixedFee: "5" },
  });

  const approved = await approveQuote(quote.id, admin.id, { weightKg: 0.5 });

  assert.equal(approved.totalPrice.toString(), "33"); // 20 + 6 + 2 + 5
  assert.equal(approved.commissionRate?.toString(), "10");
  assert.equal(approved.chinaPricePerKg?.toString(), "12");
  assert.equal(approved.fixedFee?.toString(), "5");
  // le devis provisoire garde, lui, les taux d'origine
  const rev = (await getQuoteHistory(quote.id))[0];
  assert.equal((rev.snapshotBefore as Record<string, unknown>).commissionRate, "15");
});

test("Sans poids (ni au devis ni fourni par l'admin) : approbation impossible, rien ne change", async () => {
  const { admin, quote } = await devisEnAttente();

  await assert.rejects(approveQuote(quote.id, admin.id, {}), /renseignez le poids/);

  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(q.status, "PENDING_REVIEW");
  assert.equal(q.totalPrice.toString(), "31");
  assert.equal(await prisma.quoteRevision.count(), 0);
});

test("Poids admin invalide refusé (0, négatif, trop grand, plus de 2 décimales)", async () => {
  const { admin, quote } = await devisEnAttente();

  for (const weightKg of [0, -1, 1001, NaN, Infinity]) {
    await assert.rejects(approveQuote(quote.id, admin.id, { weightKg }), /poids/i, String(weightKg));
  }
  await assert.rejects(approveQuote(quote.id, admin.id, { weightKg: 0.123 }), /2 décimales/);

  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(q.status, "PENDING_REVIEW");
});

test("Seuls les devis en attente sont approuvables", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const auto = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id);
  assert.equal(auto.status, "AUTO_APPROVED");

  await assert.rejects(approveQuote(auto.id, admin.id, { weightKg: 1 }), /en attente/);
  await rejectQuote(auto.id, admin.id, "Produit interdit");
  await assert.rejects(approveQuote(auto.id, admin.id, { weightKg: 1 }), /en attente/);
});

test("Double approbation : la seconde est refusée, une seule révision", async () => {
  const { admin, quote } = await devisEnAttente();

  await approveQuote(quote.id, admin.id, { weightKg: 0.5 });
  await assert.rejects(approveQuote(quote.id, admin.id, { weightKg: 3 }), /en attente/);

  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(q.totalPrice.toString(), "38"); // pas écrasé par la seconde tentative
  assert.equal(await prisma.quoteRevision.count(), 1);
});

test("Deux approbations simultanées : une seule passe", async () => {
  const { admin, quote } = await devisEnAttente();

  const r = await Promise.allSettled([
    approveQuote(quote.id, admin.id, { weightKg: 0.5 }),
    approveQuote(quote.id, admin.id, { weightKg: 2 }),
  ]);

  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await prisma.quoteRevision.count(), 1);
});

test("Devis inconnu : erreur claire", async () => {
  const admin = await creerAdmin();
  await creerReglages();

  await assert.rejects(approveQuote("inexistant", admin.id, { weightKg: 1 }), /Devis introuvable/);
  await assert.rejects(rejectQuote("inexistant", admin.id, "motif ok"), /Devis introuvable/);
  await assert.rejects(getQuoteHistory("inexistant"), /Devis introuvable/);
});

test("Devis antérieur à la traçabilité (colonnes vides) : approbation possible, historique cohérent", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const id = randomUUID();
  // Insertion à l'ancienne : sans aucune des nouvelles colonnes
  await prisma.$executeRaw`
    INSERT INTO "InternationalQuote"
      (id, "userId", "productUrl", "productPrice", "shippingCost", "customsCost", "commissionCost", "totalPrice")
    VALUES (${id}, ${user.id}, ${URL_PRODUIT}, 20, 0, 0, 3, 31)
  `;

  const legacy = await prisma.internationalQuote.findUniqueOrThrow({ where: { id } });
  assert.equal(legacy.currency, "USD");
  assert.equal(legacy.weightSource, null);
  assert.equal(legacy.commissionRate, null);

  const approved = await approveQuote(id, admin.id, { weightKg: 0.5 });
  assert.equal(approved.totalPrice.toString(), "38");
  const rev = (await getQuoteHistory(id))[0];
  assert.equal((rev.snapshotBefore as Record<string, unknown>).commissionRate, null);
});

// =============== Rejet ===============

test("Rejet d'un devis en attente : motif obligatoire, enregistré et historisé", async () => {
  const { admin, quote } = await devisEnAttente();

  const rejected = await rejectQuote(quote.id, admin.id, "Article interdit à l'import");

  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.adminNotes, "Article interdit à l'import");
  const rev = (await getQuoteHistory(quote.id))[0];
  assert.equal(rev.action, "REJECTED");
  assert.equal(rev.note, "Article interdit à l'import");
  assert.equal((rev.snapshotBefore as Record<string, unknown>).status, "PENDING_REVIEW");
});

test("Rejet : sans motif ou motif trop court/long refusé", async () => {
  const { admin, quote } = await devisEnAttente();

  for (const motif of ["", "  ", "ab", "x".repeat(501), undefined as unknown as string]) {
    await assert.rejects(rejectQuote(quote.id, admin.id, motif), /motif de rejet/);
  }
  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(q.status, "PENDING_REVIEW");
});

test("Un devis approuvé ne peut plus être rejeté (avant : n'importe quel statut)", async () => {
  const { admin, quote } = await devisEnAttente();
  await approveQuote(quote.id, admin.id, { weightKg: 0.5 });

  await assert.rejects(rejectQuote(quote.id, admin.id, "Trop tard"), /ne peut plus être rejeté/);

  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(q.status, "APPROVED");
});

test("Un devis déjà rejeté ne peut pas être rejeté à nouveau", async () => {
  const { admin, quote } = await devisEnAttente();
  await rejectQuote(quote.id, admin.id, "Premier motif");

  await assert.rejects(rejectQuote(quote.id, admin.id, "Second motif"), /ne peut plus être rejeté/);

  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(q.adminNotes, "Premier motif");
});

test("Un devis AUTO_APPROVED peut être rejeté par un admin", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const auto = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id);

  const rejected = await rejectQuote(auto.id, admin.id, "Produit non conforme");

  assert.equal(rejected.status, "REJECTED");
});

// =============== Paiement (règle D) ===============

test("Règle D : seuls AUTO_APPROVED et APPROVED sont payables", () => {
  assert.equal(isQuotePayable("AUTO_APPROVED"), true);
  assert.equal(isQuotePayable("APPROVED"), true);
  assert.equal(isQuotePayable("PENDING_REVIEW"), false);
  assert.equal(isQuotePayable("REJECTED"), false);
  assert.equal(isQuotePayable("n-importe-quoi"), false);
});

// =============== Historique ===============

test("Historique : plusieurs décisions sur des devis différents ne se mélangent pas", async () => {
  const a = await devisEnAttente();
  const sub = await creerSousCategorie();
  const b = await createInternationalQuote(a.user.id, URL_PRODUIT, "B", 40, sub.id);

  await approveQuote(a.quote.id, a.admin.id, { weightKg: 1 });
  await rejectQuote(b.id, a.admin.id, "Refusé");

  assert.equal((await getQuoteHistory(a.quote.id)).length, 1);
  assert.equal((await getQuoteHistory(b.id)).length, 1);
  assert.equal((await getQuoteHistory(a.quote.id))[0].action, "APPROVED");
  assert.equal((await getQuoteHistory(b.id))[0].action, "REJECTED");
});

test("Historique : l'admin est identifié sans exposer son mot de passe", async () => {
  const { admin, quote } = await devisEnAttente();
  await rejectQuote(quote.id, admin.id, "Motif valable");

  const history = await getQuoteHistory(quote.id);

  assert.equal(history[0].admin.id, admin.id);
  assert.equal(JSON.stringify(history).includes("password"), false);
});