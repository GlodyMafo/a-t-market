import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import {
  creerReglages,
  creerSousCategorie,
  creerUtilisateur,
  ticketPour,
} from "./helpers/fixtures";

import { prisma } from "../lib/prisma";
import app from "../app";
import { ExternalProductService } from "../services/externalProduct.service";
import { signQuotePreviewTicket } from "../services/quotePreviewTicket";

let server: Server;
let baseUrl = "";
const originalFetch = ExternalProductService.prototype.fetchProduct;
let extraction: (url: string) => Promise<any>;

before(async () => {
  await startTestDb();
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  ExternalProductService.prototype.fetchProduct = originalFetch;
  server.close();
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  extraction = async (url) => ({
    source: "SHEIN", url, name: "Robe fleurie", price: 20, currency: "USD",
    images: [], sizes: [], colors: [], inStock: true,
  });
  ExternalProductService.prototype.fetchProduct = async function (url: string) {
    return extraction(url);
  };
});

const token = (userId: string) => jwt.sign({ userId, role: "USER" }, process.env.JWT_SECRET!, { expiresIn: "1h" });

const creer = (userId: string, body: unknown) =>
  fetch(`${baseUrl}/api/international-quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(userId)}` },
    body: JSON.stringify(body),
  });

test("Création de devis connecté : 201, prix pris de l'EXTRACTION (pas du corps), options, validité", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const res = await creer(user.id, {
    productUrl: "https://www.shein.com/Robe-p-1.html",
    subCategoryId: sub.id,
    productPrice: 1, // le client essaie d'imposer son prix : ignoré
    productName: "  Nom choisi par le client  ",
    options: "Taille M, noir",
  });

  assert.equal(res.status, 201);
  const q = (await res.json()).data;
  assert.equal(q.totalPrice, "38");
  assert.equal(q.productName, "Nom choisi par le client");
  assert.equal(q.options, "Taille M, noir");
  assert.ok(q.expiresAt);
  assert.equal(q.weightSource, "CATALOG_ESTIMATE");
});

test("Création de devis : devise EUR -> 400, aucun devis créé", async () => {
  await creerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  extraction = async (url) => ({ source: "SHEIN", url, name: "X", price: 20, currency: "EUR", images: [], sizes: [], colors: [], inStock: true });

  const res = await creer(user.id, { productUrl: "https://www.shein.com/Robe-p-1.html", subCategoryId: sub.id });

  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /devise/);
  assert.equal(await prisma.internationalQuote.count(), 0);
});

test("Création NOON AED depuis un ticket : prix USD conservé, métadonnées AED et aucune extraction", async () => {
  await creerReglages();

  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const { ticket, payload } = ticketPour(sub.id, {
    over: {
      productUrl: "https://www.noon.com/uae-en/product/N70167848V/p/",
      productName: "Galaxy S25 Ultra",
      productPrice: "2064.30",
      sourceProductPrice: "2949.00",
      sourceCurrency: "AED",
      exchangeRate: "0.7",
    },
  });

  let extractionCount = 0;
  extraction = async () => {
    extractionCount++;
    throw new Error("Une extraction ne devait pas être appelée");
  };

  const res = await creer(user.id, { ticket });

  assert.equal(res.status, 201);

  const q = (await res.json()).data;

  assert.equal(extractionCount, 0);
  assert.equal(q.productName, "Galaxy S25 Ultra");
  assert.equal(q.productPrice, "2064.3");
  assert.equal(q.currency, "USD");
  assert.equal(q.sourceProductPrice, "2949");
  assert.equal(q.sourceCurrency, "AED");
  assert.equal(q.exchangeRate, "0.7");
  assert.equal(q.previewId, payload.id);

  assert.equal(await prisma.internationalQuote.count(), 1);
});

test("Création depuis le même ticket : idempotence, un seul devis", async () => {
  await creerReglages();

  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const { ticket } = ticketPour(sub.id, {
    over: {
      productUrl: "https://www.noon.com/uae-en/product/N70167848V/p/",
      productName: "Galaxy S25 Ultra",
      productPrice: "2064.30",
      sourceProductPrice: "2949.00",
      sourceCurrency: "AED",
      exchangeRate: "0.7",
    },
  });

  const premiere = await creer(user.id, { ticket });
  const seconde = await creer(user.id, { ticket });

  assert.equal(premiere.status, 201);
  assert.equal(seconde.status, 200);

  const q1 = (await premiere.json()).data;
  const q2 = (await seconde.json()).data;

  assert.equal(q2.id, q1.id);
  assert.equal(await prisma.internationalQuote.count(), 1);
});

test("Un ticket déjà utilisé par un autre compte : 409, aucun second devis", async () => {
  await creerReglages();

  const userA = await creerUtilisateur();
  const userB = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const { ticket } = ticketPour(sub.id, {
    over: {
      productUrl: "https://www.noon.com/uae-en/product/N70167848V/p/",
      productName: "Galaxy S25 Ultra",
      productPrice: "2064.30",
      sourceProductPrice: "2949.00",
      sourceCurrency: "AED",
      exchangeRate: "0.7",
    },
  });

  const premiere = await creer(userA.id, { ticket });
  const seconde = await creer(userB.id, { ticket });

  assert.equal(premiere.status, 201);
  assert.equal(seconde.status, 409);

  assert.equal(
    await prisma.internationalQuote.count(),
    1
  );

  assert.equal(
    await prisma.internationalQuote.count({
      where: { userId: userB.id },
    }),
    0
  );
});

test("Ticket falsifié : rejet 400, aucun devis créé", async () => {
  await creerReglages();

  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);

  const [payload, signature] = ticket.split(".");
  const modifiedPayload = Buffer.from(
    JSON.stringify({ productPrice: "9999" })
  ).toString("base64url");

  const falsifiedTicket = `${modifiedPayload}.${signature}`;

  const res = await creer(user.id, { ticket: falsifiedTicket });

  assert.equal(res.status, 400);
  assert.equal(await prisma.internationalQuote.count(), 0);
});

test("Ticket expiré : rejet 400, aucun devis créé", async () => {
  await creerReglages();

  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const emission = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  const { ticket } = ticketPour(sub.id, {
    now: emission,
  });

  const res = await creer(user.id, { ticket });

  assert.equal(res.status, 400);
  assert.equal(await prisma.internationalQuote.count(), 0);
});

test("Ticket signé avec une sous-catégorie désactivée : rejet 400", async () => {
  await creerReglages();

  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);

  await prisma.subCategory.update({
    where: { id: sub.id },
    data: { isActive: false },
  });

  const res = await creer(user.id, { ticket });

  assert.equal(res.status, 400);
  assert.equal(await prisma.internationalQuote.count(), 0);
});