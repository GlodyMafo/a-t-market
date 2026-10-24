import "./setup";
import "./setup.previewLimitHigh";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { FakePawapay } from "./helpers/fakePawapay";
import {
  creerAdmin,
  creerDevis,
  creerProduit,
  creerReglages,
  creerSousCategorie,
  creerUtilisateur,
  stockDe,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";
import { ExternalProductService } from "../services/externalProduct.service";
import { previewExtractionGate } from "../services/extractionGate";

const pawapay = new FakePawapay();
let server: Server;
let baseUrl = "";
const originalFetch = ExternalProductService.prototype.fetchProduct;

before(async () => {
  await startTestDb();
  await pawapay.start();
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  ExternalProductService.prototype.fetchProduct = originalFetch;
  server.close();
  await pawapay.stop();
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  pawapay.reset();
  previewExtractionGate.reset();
  // Extraction SHEIN simulée : aucun appel réseau.
  ExternalProductService.prototype.fetchProduct = async function (url: string) {
    return {
      source: "SHEIN", url, name: "Robe fleurie", price: 20, currency: "USD",
      images: ["https://img.shein.com/1.jpg"], sizes: [], colors: [], inStock: true,
    } as any;
  };
});

const token = (userId: string, role: "USER" | "ADMIN" = "USER") =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: "1h" });

async function call(method: string, path: string, opts?: { as?: string | null; body?: unknown }) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts?.as ? { Authorization: `Bearer ${opts.as}` } : {}),
    },
    body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const URL_PRODUIT = "https://www.shein.com/Robe-p-1.html";

// =============== LE parcours : invité -> connexion -> fusion -> commande -> paiement ===============

test("PARCOURS COMPLET : aperçu invité, fusion après connexion, commande hybride, paiement, PAID", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const iphone = await creerProduit({ stock: 5, price: "520.00", margin: "15.00", name: "Iphone" });

  // 1. L'invité (sans compte) obtient un aperçu du produit international
  const apercu = await call("POST", "/api/international-quotes/preview", {
    body: { productUrl: URL_PRODUIT, subCategoryId: sub.id },
  });
  assert.equal(apercu.status, 200);
  assert.equal(apercu.json.data.preview.totalPrice, "38");
  const ticket = apercu.json.data.ticket;
  assert.equal(await prisma.internationalQuote.count(), 0); // rien d'enregistré

  // 2. Il se connecte : le navigateur envoie son panier invité
  const user = await creerUtilisateur();
  const fusion = await call("POST", "/api/cart/merge", {
    as: token(user.id),
    body: {
      items: [
        { type: "LOCAL", productId: iphone.id, quantity: 2 },
        { type: "INTERNATIONAL", ticket, options: "Taille M, noir" },
      ],
    },
  });
  assert.equal(fusion.status, 200);
  assert.deepEqual(fusion.json.data.results.map((r: any) => r.status), ["ADDED", "ADDED"]);
  assert.equal(fusion.json.data.cart.checkoutReady, true);
  assert.equal(fusion.json.data.cart.estimatedTotal, "1108"); // 2 x 535 + 38

  // 3. Le panier hybride
  const panier = await call("GET", "/api/cart/me", { as: token(user.id) });
  assert.equal(panier.json.data.items.length, 2);
  assert.deepEqual(panier.json.data.items.map((i: any) => i.kind).sort(), ["INTERNATIONAL", "LOCAL"]);

  // 4. Commande hybride
  const commande = await call("POST", "/api/orders", { as: token(user.id) });
  assert.equal(commande.status, 201);
  const order = commande.json.data;
  assert.equal(order.productsAmount, "1101"); // 1070 + (38 - 7)
  assert.equal(order.shippingAmount, "7");
  assert.equal(order.totalAmount, "1108");
  assert.equal(await stockDe(iphone.id), 3);

  // 5. Paiement Mobile Money
  const paiement = await call("POST", "/api/payments", {
    as: token(user.id),
    body: { orderId: order.id, paymentType: "FULL", phoneNumber: "243990000001", provider: "AIRTEL" },
  });
  assert.equal(paiement.status, 201);
  assert.equal(Number(pawapay.deposits[0].amount), 1108);
  const depositId = paiement.json.data.providerReference;

  // 6. PawaPay confirme (le callback n'est qu'un signal, la vérification se fait auprès de PawaPay)
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "1108", currency: "USD" });
  const callback = await call("POST", "/api/payments/pawapay/callback", { body: { depositId } });
  assert.equal(callback.status, 200);

  // 7. La commande est payée ; l'article-devis garde sa copie figée
  const relue = await call("GET", `/api/orders/${order.id}`, { as: token(user.id) });
  assert.equal(relue.json.data.status, "PAID");
  const articleDevis = relue.json.data.items.find((i: any) => i.quoteId);
  assert.equal(articleDevis.product, null);
  assert.equal(articleDevis.quoteSnapshot.productUrl, URL_PRODUIT);
  assert.equal(articleDevis.quoteSnapshot.options, "Taille M, noir");
  assert.equal(articleDevis.quoteSnapshot.totalPrice, "38");

  // 8. Rejouer la fusion n'ajoute rien : le devis est déjà commandé, un seul devis existe
  const rejeu = await call("POST", "/api/cart/merge", {
    as: token(user.id),
    body: { items: [{ type: "INTERNATIONAL", ticket }] },
  });
  assert.equal(rejeu.json.data.results[0].status, "REJECTED");
  assert.match(rejeu.json.data.results[0].reason, /déjà dans une commande/);
  assert.equal(await prisma.internationalQuote.count(), 1);
});

test("RÈGLE D de bout en bout : aperçu provisoire -> panier -> commande REFUSÉE -> approbation admin -> commande acceptée", async () => {
  await creerReglages();
  const sub = await creerSousCategorie(); // pas de poids au catalogue
  const user = await creerUtilisateur();
  const admin = await creerAdmin();

  const apercu = await call("POST", "/api/international-quotes/preview", {
    body: { productUrl: URL_PRODUIT, subCategoryId: sub.id },
  });
  assert.equal(apercu.json.data.preview.isProvisional, true);
  assert.equal(apercu.json.data.preview.totalPrice, "31");

  const fusion = await call("POST", "/api/cart/merge", {
    as: token(user.id),
    body: { items: [{ type: "INTERNATIONAL", ticket: apercu.json.data.ticket }] },
  });
  const quoteId = fusion.json.data.results[0].quoteId;
  const article = fusion.json.data.cart.items[0];
  assert.equal(article.payable, false);
  assert.equal(article.issue, "PENDING_REVIEW");
  assert.equal(fusion.json.data.cart.checkoutReady, false);

  // La commande est refusée : le prix est provisoire
  const refus = await call("POST", "/api/orders", { as: token(user.id) });
  assert.equal(refus.status, 400);
  assert.match(refus.json.message, /en attente de validation/);
  assert.equal(await prisma.order.count(), 0);

  // L'admin renseigne le poids et approuve
  const approbation = await call("POST", `/api/admin/quotes/approve/${quoteId}`, {
    as: token(admin.id, "ADMIN"),
    body: { weightKg: 0.5 },
  });
  assert.equal(approbation.status, 200);

  const panier = await call("GET", "/api/cart/me", { as: token(user.id) });
  assert.equal(panier.json.data.checkoutReady, true);
  assert.equal(panier.json.data.estimatedTotal, "38");

  const commande = await call("POST", "/api/orders", { as: token(user.id) });
  assert.equal(commande.status, 201);
  assert.equal(commande.json.data.totalAmount, "38");
});

// =============== Accès et validation ===============

test("Fusion et ajout de devis : sans jeton -> 401", async () => {
  assert.equal((await call("POST", "/api/cart/merge", { body: { items: [] } })).status, 401);
  assert.equal((await call("POST", "/api/cart/quotes", { body: { quoteId: "x" } })).status, 401);
});

test("Fusion : corps invalides -> 400 sans rien modifier", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 5 });

  for (const body of [
    {},
    { items: "x" },
    { items: [{ type: "LOCAL", productId: produit.id, quantity: 0 }] },
    { items: [{ type: "LOCAL", productId: produit.id, quantity: 1, price: 0 }] },
    { items: [{ type: "INCONNU" }] },
    { items: Array.from({ length: 51 }, () => ({ type: "LOCAL", productId: produit.id, quantity: 1 })) },
  ]) {
    const r = await call("POST", "/api/cart/merge", { as: token(user.id), body });
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(await prisma.cartItem.count(), 0);
});

test("Le jeton d'un client ne permet pas de fusionner dans le panier d'un autre", async () => {
  const a = await creerUtilisateur();
  const b = await creerUtilisateur();
  const produit = await creerProduit({ stock: 5 });

  await call("POST", "/api/cart/merge", {
    as: token(a.id),
    body: { items: [{ type: "LOCAL", productId: produit.id, quantity: 2 }] },
  });

  assert.equal(await prisma.cartItem.count({ where: { cart: { userId: a.id } } }), 1);
  assert.equal(await prisma.cartItem.count({ where: { cart: { userId: b.id } } }), 0);
});

test("POST /api/cart/quotes : 201 puis 200 (déjà au panier), devis d'un autre -> 400", async () => {
  const user = await creerUtilisateur();
  const autre = await creerUtilisateur();
  const monDevis = await creerDevis(user.id);
  const sonDevis = await creerDevis(autre.id);

  const premiere = await call("POST", "/api/cart/quotes", { as: token(user.id), body: { quoteId: monDevis.id } });
  const seconde = await call("POST", "/api/cart/quotes", { as: token(user.id), body: { quoteId: monDevis.id } });
  const volee = await call("POST", "/api/cart/quotes", { as: token(user.id), body: { quoteId: sonDevis.id } });
  const sansId = await call("POST", "/api/cart/quotes", { as: token(user.id), body: {} });

  assert.equal(premiere.status, 201);
  assert.equal(premiere.json.data.status, "ADDED");
  assert.equal(seconde.status, 200);
  assert.equal(seconde.json.data.status, "ALREADY_IN_CART");
  assert.equal(volee.status, 400);
  assert.equal(volee.json.message, "Devis introuvable");
  assert.equal(sansId.status, 400);
  assert.equal(await prisma.cartItem.count(), 1);
});

test("Modifier la quantité d'un article-devis par HTTP : refusé", async () => {
  const user = await creerUtilisateur();
  const devis = await creerDevis(user.id);
  const ajout = await call("POST", "/api/cart/quotes", { as: token(user.id), body: { quoteId: devis.id } });

  const r = await call("PATCH", `/api/cart/item/${ajout.json.data.itemId}`, {
    as: token(user.id),
    body: { quantity: 3 },
  });

  assert.equal(r.status, 400);
  assert.match(r.json.message, /ne peut pas être modifiée/);
});