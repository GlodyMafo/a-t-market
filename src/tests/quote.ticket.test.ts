import "./setup";

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import {
  signQuotePreviewTicket,
  verifyQuotePreviewTicket,
  QuotePreviewTicketData,
} from "../services/quotePreviewTicket";

const DATA: QuotePreviewTicketData = {
  productUrl: "https://www.shein.com/x-p-1.html",
  productName: "Robe",
  imageUrl: "https://img.shein.com/1.jpg",
  productPrice: "20",
  weightKg: "0.5",
  weightSource: "CATALOG_ESTIMATE",
  subCategoryId: "sub-1",
  commissionRate: "15",
  chinaPricePerKg: "14",
  fixedFee: "8",
};

const NOW = new Date("2026-10-18T10:00:00Z");

// Même dérivation de clé que le serveur : permet de fabriquer un ticket VALIDEMENT SIGNÉ mais mal formé.
const KEY = (secret: string) =>
  crypto.createHash("sha256").update(`quote-preview-ticket-v1|${secret}`).digest();

function forge(payload: unknown, secret = process.env.JWT_SECRET!) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", KEY(secret)).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

const valid = () => signQuotePreviewTicket(DATA, NOW);

test("Aller-retour : un ticket signé se vérifie et restitue exactement les données", () => {
  const { ticket, payload } = valid();

  const verified = verifyQuotePreviewTicket(ticket, NOW);

  assert.deepEqual(verified, payload);
  assert.equal(verified.productPrice, "20");
  assert.equal(verified.commissionRate, "15");
});

test("Validité : 24 h exactement ; invalide à la seconde d'expiration", () => {
  const { ticket, payload, expiresAt } = valid();

  assert.equal(expiresAt.getTime() - NOW.getTime(), 24 * 3600 * 1000);
  assert.doesNotThrow(() => verifyQuotePreviewTicket(ticket, new Date(payload.exp * 1000 - 1000)));
  assert.throws(() => verifyQuotePreviewTicket(ticket, new Date(payload.exp * 1000)), /invalide ou expiré/);
  assert.throws(() => verifyQuotePreviewTicket(ticket, new Date(payload.exp * 1000 + 86400000)), /invalide ou expiré/);
});

test("Chaque ticket a un identifiant unique", () => {
  assert.notEqual(valid().payload.id, valid().payload.id);
});

test("FALSIFICATION du prix dans le contenu : signature invalide", () => {
  const { ticket, payload } = valid();
  const [, signature] = ticket.split(".");
  const tampered = Buffer.from(JSON.stringify({ ...payload, productPrice: "1" })).toString("base64url");

  assert.throws(() => verifyQuotePreviewTicket(`${tampered}.${signature}`, NOW), /invalide ou expiré/);
});

test("FALSIFICATION du poids, des taux, du lien, de la sous-catégorie : tous refusés", () => {
  const { ticket, payload } = valid();
  const [, signature] = ticket.split(".");
  const variantes: Record<string, unknown>[] = [
    { weightKg: "0.01" },
    { weightKg: null },
    { commissionRate: "0" },
    { chinaPricePerKg: "1" },
    { fixedFee: "0" },
    { productUrl: "https://www.shein.com/autre" },
    { subCategoryId: "autre" },
    { exp: payload.exp + 999999 },
  ];

  for (const v of variantes) {
    const enc = Buffer.from(JSON.stringify({ ...payload, ...v })).toString("base64url");
    assert.throws(() => verifyQuotePreviewTicket(`${enc}.${signature}`, NOW), /invalide ou expiré/, JSON.stringify(v));
  }
});

test("Signature d'un AUTRE ticket recollée : refusée", () => {
  const a = valid().ticket;
  const b = signQuotePreviewTicket({ ...DATA, productPrice: "99" }, NOW).ticket;

  assert.throws(() => verifyQuotePreviewTicket(`${a.split(".")[0]}.${b.split(".")[1]}`, NOW), /invalide ou expiré/);
});

test("Ticket signé avec un AUTRE secret : refusé", () => {
  const { payload } = valid();

  assert.throws(() => verifyQuotePreviewTicket(forge(payload, "un-autre-secret-0123456789"), NOW), /invalide ou expiré/);
});

test("Un jeton de CONNEXION (JWT) n'est pas un ticket valide", () => {
  const token = jwt.sign({ userId: "u1", role: "USER" }, process.env.JWT_SECRET!, { expiresIn: "1h" });

  assert.throws(() => verifyQuotePreviewTicket(token, NOW), /invalide ou expiré/);
});

test("Formes absurdes refusées sans planter", () => {
  const poubelles: unknown[] = [
    "", " ", "abc", "a.b.c", ".", "a.", ".b", "..", 12345, null, undefined, {}, [], true,
    "x".repeat(7000), `${"a".repeat(100)}.${"b".repeat(100)}`,
  ];

  for (const p of poubelles) {
    assert.throws(() => verifyQuotePreviewTicket(p, NOW), /invalide ou expiré/, String(p).slice(0, 30));
  }
});

test("Ticket VALIDEMENT SIGNÉ mais mal formé : refusé par la vérification de forme", () => {
  const { payload } = valid();
  const mauvais: Record<string, unknown>[] = [
    { v: 2 },
    { productPrice: "-5" },
    { productPrice: "abc" },
    { productPrice: "1e3" },
    { productPrice: "20.123" },
    { productPrice: "" },
    { weightKg: "abc" },
    { id: "pas-un-uuid" },
    { exp: 1.5 },
    { exp: "1" },
    { productUrl: "" },
    { weightSource: "ADMIN" },
    { extra: "champ inconnu" },
  ];

  for (const m of mauvais) {
    assert.throws(
      () => verifyQuotePreviewTicket(forge({ ...payload, ...m }), NOW),
      /invalide ou expiré/,
      JSON.stringify(m)
    );
  }
  // champ manquant
  const { productPrice: _omis, ...sansPrix } = payload;
  assert.throws(() => verifyQuotePreviewTicket(forge(sansPrix), NOW), /invalide ou expiré/);
});

test("Poids inconnu : un ticket avec weightKg et weightSource à null est valide", () => {
  const { ticket } = signQuotePreviewTicket({ ...DATA, weightKg: null, weightSource: null }, NOW);

  const v = verifyQuotePreviewTicket(ticket, NOW);

  assert.equal(v.weightKg, null);
  assert.equal(v.weightSource, null);
});


test("Ticket NOON : les informations de conversion AED vers USD sont conservées", () => {
  const { ticket } = signQuotePreviewTicket(
    {
      ...DATA,
      sourceProductPrice: "2949",
      sourceCurrency: "AED",
      exchangeRate: "0.272294",
    },
    NOW
  );

  const verified = verifyQuotePreviewTicket(ticket, NOW);

  assert.equal(verified.sourceProductPrice, "2949");
  assert.equal(verified.sourceCurrency, "AED");
  assert.equal(verified.exchangeRate, "0.272294");
});

test("Ticket de conversion incomplet ou invalide : refusé", () => {
  const { payload } = valid();

  const invalides = [
    { sourceProductPrice: "100" },
    { sourceCurrency: "AED" },
    { exchangeRate: "0.27" },
    {
      sourceProductPrice: "0",
      sourceCurrency: "AED",
      exchangeRate: "0.27",
    },
    {
      sourceProductPrice: "100",
      sourceCurrency: "EUR",
      exchangeRate: "0.27",
    },
    {
      sourceProductPrice: "100",
      sourceCurrency: "AED",
      exchangeRate: "0",
    },
  ];

  for (const fields of invalides) {
    assert.throws(
      () =>
        verifyQuotePreviewTicket(
          forge({ ...payload, ...fields }),
          NOW
        ),
      /invalide ou expiré/
    );
  }
});
