import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerReglages, creerSousCategorie, creerUtilisateur } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";
import { ExternalProductService } from "../services/externalProduct.service";

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