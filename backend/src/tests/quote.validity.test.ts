import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerAdmin, creerReglages, creerSousCategorie, creerUtilisateur } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import {
  cleanQuoteOptions,
  createInternationalQuote,
  isQuoteExpired,
  quoteValidUntil,
} from "../services/internationalQuote.service";
import { approveQuote } from "../services/internationalQuote.admin.service";

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
const JOUR = 24 * 3600 * 1000;

// =============== Validité ===============

test("La validité est de 7 jours", () => {
  const d = new Date("2026-10-18T10:00:00Z");
  assert.equal(quoteValidUntil(d).getTime() - d.getTime(), 7 * JOUR);
});

test("Devis AUTO_APPROVED : fin de validité à 7 jours", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id);

  assert.ok(q.expiresAt);
  const ecart = q.expiresAt!.getTime() - Date.now();
  assert.ok(Math.abs(ecart - 7 * JOUR) < 60_000);
});

test("Devis PENDING_REVIEW : aucune fin de validité tant qu'il n'est pas validé", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie();

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id);

  assert.equal(q.status, "PENDING_REVIEW");
  assert.equal(q.expiresAt, null);
});

test("L'approbation admin démarre la validité de 7 jours (et la garde dans l'historique)", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const sub = await creerSousCategorie();
  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id);

  const approved = await approveQuote(q.id, admin.id, { weightKg: 0.5 });

  assert.ok(approved.expiresAt);
  assert.ok(Math.abs(approved.expiresAt!.getTime() - Date.now() - 7 * JOUR) < 60_000);
  const rev = await prisma.quoteRevision.findFirstOrThrow({ where: { quoteId: q.id } });
  assert.equal((rev.snapshotBefore as Record<string, unknown>).expiresAt, null);
  assert.ok((rev.snapshotAfter as Record<string, unknown>).expiresAt);
});

test("isQuoteExpired : avec une date de fin explicite", () => {
  const now = new Date("2026-10-18T10:00:00Z");
  const createdAt = new Date("2026-10-01T00:00:00Z");

  assert.equal(isQuoteExpired({ expiresAt: new Date(now.getTime() + 1000), createdAt }, now), false);
  assert.equal(isQuoteExpired({ expiresAt: new Date(now.getTime()), createdAt }, now), true); // à la limite : périmé
  assert.equal(isQuoteExpired({ expiresAt: new Date(now.getTime() - 1000), createdAt }, now), true);
});

test("isQuoteExpired : ancien devis sans date de fin = 7 jours après sa création", () => {
  const now = new Date("2026-10-18T10:00:00Z");

  assert.equal(isQuoteExpired({ expiresAt: null, createdAt: new Date(now.getTime() - 6 * JOUR) }, now), false);
  assert.equal(isQuoteExpired({ expiresAt: null, createdAt: new Date(now.getTime() - 7 * JOUR) }, now), true);
  assert.equal(isQuoteExpired({ expiresAt: null, createdAt: new Date(now.getTime() - 30 * JOUR) }, now), true);
});

// =============== Options (taille, couleur) ===============

test("Options : nettoyées (espaces, retours à la ligne), limitées à 200 caractères", () => {
  assert.equal(cleanQuoteOptions(" Taille  M,\n noir "), "Taille M, noir");
  assert.equal(cleanQuoteOptions("a".repeat(500))?.length, 200);
  assert.equal(cleanQuoteOptions("bon\u0000\u0007texte"), "bon texte");
});

test("Options : vide, espaces ou type inattendu -> aucune option", () => {
  for (const v of ["", "   ", "\n\t", null, undefined, 42, {}, ["M"]]) {
    assert.equal(cleanQuoteOptions(v), null, String(v));
  }
});

test("Les options sont enregistrées avec le devis", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id, undefined, "  Taille M, noir ");

  assert.equal(q.options, "Taille M, noir");
});

test("Sans option fournie : null", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const q = await createInternationalQuote(user.id, URL_PRODUIT, "T", 20, sub.id);

  assert.equal(q.options, null);
});