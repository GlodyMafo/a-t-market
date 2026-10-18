import "./setup";
import "./setup.previewLimitHigh";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerReglages, creerSousCategorie } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";
import { ExternalProductService } from "../services/externalProduct.service";
import { previewExtractionGate } from "../services/extractionGate";
import { verifyQuotePreviewTicket } from "../services/quotePreviewTicket";

let server: Server;
let baseUrl = "";
const originalFetch = ExternalProductService.prototype.fetchProduct;
let extractions: string[] = [];
let fetchBehavior: (url: string) => Promise<any>;

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
  previewExtractionGate.reset();
  extractions = [];
  fetchBehavior = async (url) => ({
    source: "SHEIN",
    url,
    name: "Robe fleurie",
    price: 20,
    currency: "USD",
    images: ["https://img.shein.com/1.jpg"],
    sizes: [],
    colors: [],
    inStock: true,
    raw: { secret: "DONNEE-INTERNE-APIFY" },
  });
  // On remplace l'extraction réelle (Apify) : aucun appel réseau dans les tests.
  ExternalProductService.prototype.fetchProduct = async function (url: string) {
    extractions.push(url);
    return fetchBehavior(url);
  };
});

const preview = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}/api/international-quotes/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const URL_OK = "https://www.shein.com/Robe-p-1.html";

async function sousCategorieAvecPoids() {
  await creerReglages();
  return creerSousCategorie({ weightKg: "0.5" });
}

test("Aperçu PUBLIC (sans jeton) : 200, ticket, détail du prix", async () => {
  const sub = await sousCategorieAvecPoids();

  const res = await preview({ productUrl: URL_OK, subCategoryId: sub.id });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.preview.totalPrice, "38");
  assert.equal(json.data.preview.status, "AUTO_APPROVED");
  assert.equal(typeof json.data.ticket, "string");
  assert.equal(verifyQuotePreviewTicket(json.data.ticket).productPrice, "20");
});

test("La réponse ne contient QUE les champs prévus (aucune donnée brute d'Apify)", async () => {
  const sub = await sousCategorieAvecPoids();

  const json = await (await preview({ productUrl: URL_OK, subCategoryId: sub.id })).json();

  assert.deepEqual(Object.keys(json.data).sort(), ["preview", "ticket"]);
  assert.equal(JSON.stringify(json).includes("DONNEE-INTERNE-APIFY"), false);
  assert.equal("raw" in json.data.preview, false);
});

test("Un en-tête Authorization invalide n'empêche pas l'aperçu (route publique)", async () => {
  const sub = await sousCategorieAvecPoids();

  const res = await preview({ productUrl: URL_OK, subCategoryId: sub.id }, { Authorization: "Bearer n-importe-quoi" });

  assert.equal(res.status, 200);
});

test("L'aperçu n'écrit rien en base", async () => {
  const sub = await sousCategorieAvecPoids();

  await preview({ productUrl: URL_OK, subCategoryId: sub.id });

  assert.equal(await prisma.internationalQuote.count(), 0);
  assert.equal(await prisma.user.count(), 0);
  assert.equal(await prisma.cart.count(), 0);
});

test("Corps invalides -> 400 et AUCUNE extraction payante", async () => {
  const sub = await sousCategorieAvecPoids();

  for (const body of [
    {},
    { productUrl: URL_OK },
    { subCategoryId: sub.id },
    { productUrl: 42, subCategoryId: sub.id },
    { productUrl: "https://shein.com.evil.com/x", subCategoryId: sub.id },
    { productUrl: "https://www.amazon.com/dp/1", subCategoryId: sub.id },
    { productUrl: URL_OK, subCategoryId: "inexistante" },
  ]) {
    const res = await preview(body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(extractions.length, 0);
});

test("Échec Apify : 400 avec message générique, détail interne jamais exposé", async () => {
  const sub = await sousCategorieAvecPoids();
  fetchBehavior = async () => {
    throw new Error("Apify token=SECRET_APIFY_DETAIL");
  };

  const res = await preview({ productUrl: URL_OK, subCategoryId: sub.id });

  assert.equal(res.status, 400);
  assert.equal(JSON.stringify(await res.json()).includes("SECRET_APIFY_DETAIL"), false);
});

test("Même lien deux fois : une seule extraction (cache)", async () => {
  const sub = await sousCategorieAvecPoids();

  await preview({ productUrl: URL_OK, subCategoryId: sub.id });
  await preview({ productUrl: URL_OK, subCategoryId: sub.id });

  assert.equal(extractions.length, 1);
});

test("Budget quotidien épuisé : 503", async () => {
  const sub = await sousCategorieAvecPoids();
  (previewExtractionGate as any).options = { ttlMs: 3_600_000, maxEntries: 500, dailyBudget: 1 };

  assert.equal((await preview({ productUrl: URL_OK, subCategoryId: sub.id })).status, 200);
  const res = await preview({ productUrl: "https://www.shein.com/Autre-p-2.html", subCategoryId: sub.id });

  assert.equal(res.status, 503);
  (previewExtractionGate as any).options = { ttlMs: 3_600_000, maxEntries: 500, dailyBudget: 300 };
});

test("Devise non USD -> 400", async () => {
  const sub = await sousCategorieAvecPoids();
  fetchBehavior = async (url) => ({ source: "SHEIN", url, name: "X", price: 20, currency: "EUR", images: [], sizes: [], colors: [], inStock: true });

  const res = await preview({ productUrl: URL_OK, subCategoryId: sub.id });

  assert.equal(res.status, 400);
});

test("Un ticket n'est PAS un jeton de connexion : refusé sur une route protégée", async () => {
  const sub = await sousCategorieAvecPoids();
  const json = await (await preview({ productUrl: URL_OK, subCategoryId: sub.id })).json();

  for (const path of ["/api/cart/me", "/api/orders/me", "/api/admin/orders"]) {
    const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${json.data.ticket}` } });
    assert.equal(res.status, 401, path);
  }
});