import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import {
  assurerReglages,
  creerAdmin,
  creerProduit,
  creerSousCategorie,
  creerUtilisateur,
  ticketPour,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import { MergeInputError, addToCart, mergeGuestCart } from "../services/cart.service";
import { rejectQuote } from "../services/internationalQuote.admin.service";
import { createOrderFromCart } from "../services/order.service";

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

const local = (productId: string, quantity: number) => ({ type: "LOCAL" as const, productId, quantity });
const intl = (ticket: string, options?: string) => ({ type: "INTERNATIONAL" as const, ticket, options });

async function quantiteLocale(userId: string, productId: string) {
  const item = await prisma.cartItem.findFirst({ where: { cart: { userId }, productId } });
  return item?.quantity ?? 0;
}

// =============== Produits locaux ===============

test("Fusion locale : les quantités s'additionnent (2 invité + 1 compte = 3), sans doublon", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 10 });
  await addToCart({ userId: user.id, productId: produit.id, quantity: 1 });

  const { results } = await mergeGuestCart(user.id, { items: [local(produit.id, 2)] });

  assert.equal(results[0].status, "MERGED");
  assert.equal(results[0].quantity, 3);
  assert.equal(await quantiteLocale(user.id, produit.id), 3);
  assert.equal(await prisma.cartItem.count(), 1);
});

test("Produit absent du compte : ajouté (ADDED)", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 10 });

  const { results } = await mergeGuestCart(user.id, { items: [local(produit.id, 2)] });

  assert.equal(results[0].status, "ADDED");
  assert.equal(await quantiteLocale(user.id, produit.id), 2);
});

test("Quantité plafonnée au stock : ADJUSTED avec explication (aucune perte silencieuse)", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 4, name: "Casque" });
  await addToCart({ userId: user.id, productId: produit.id, quantity: 3 });

  const { results } = await mergeGuestCart(user.id, { items: [local(produit.id, 2)] });

  assert.equal(results[0].status, "ADJUSTED");
  assert.equal(results[0].quantity, 4);
  assert.match(results[0].reason ?? "", /stock disponible \(4\)/);
  assert.equal(await quantiteLocale(user.id, produit.id), 4);
});

test("Produit en rupture : REJECTED, la quantité déjà au panier est conservée", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 2, name: "Souris" });
  await addToCart({ userId: user.id, productId: produit.id, quantity: 2 });
  await prisma.inventory.update({ where: { productId: produit.id }, data: { quantity: 0 } });

  const { results } = await mergeGuestCart(user.id, { items: [local(produit.id, 1)] });

  assert.equal(results[0].status, "REJECTED");
  assert.match(results[0].reason ?? "", /rupture de stock/);
  assert.equal(await quantiteLocale(user.id, produit.id), 2);
});

test("Produit inconnu ou désactivé : REJECTED, rien n'est ajouté", async () => {
  const user = await creerUtilisateur();
  const inactif = await creerProduit({ stock: 5, isActive: false });

  const { results } = await mergeGuestCart(user.id, {
    items: [local("inexistant", 1), local(inactif.id, 1)],
  });

  assert.deepEqual(results.map((r) => r.status), ["REJECTED", "REJECTED"]);
  assert.equal(await prisma.cartItem.count(), 0);
});

test("Le même produit deux fois dans le panier invité : fusionné en une seule ligne", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 10 });

  const { results } = await mergeGuestCart(user.id, {
    items: [local(produit.id, 1), local(produit.id, 2)],
  });

  assert.deepEqual(results.map((r) => r.status), ["ADDED", "MERGED"]);
  assert.equal(await quantiteLocale(user.id, produit.id), 3);
  assert.equal(await prisma.cartItem.count(), 1);
});

test("Produit international du catalogue : pas de plafond de stock local", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ type: "INTERNATIONAL" });

  const { results } = await mergeGuestCart(user.id, { items: [local(produit.id, 7)] });

  assert.equal(results[0].status, "ADDED");
  assert.equal(await quantiteLocale(user.id, produit.id), 7);
});

test("Les articles déjà dans le compte ne sont JAMAIS perdus par la fusion", async () => {
  const user = await creerUtilisateur();
  const a = await creerProduit({ stock: 10 });
  const b = await creerProduit({ stock: 10 });
  await addToCart({ userId: user.id, productId: a.id, quantity: 2 });

  await mergeGuestCart(user.id, { items: [local(b.id, 1)] });

  assert.equal(await quantiteLocale(user.id, a.id), 2);
  assert.equal(await quantiteLocale(user.id, b.id), 1);
});

// =============== Produits internationaux (tickets) ===============

test("Ticket valide : devis enregistré avec le prix annoncé (38 $), sans appel à Apify, et mis au panier", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { payload, ticket } = ticketPour(sub.id);

  const { results, cart } = await mergeGuestCart(user.id, { items: [intl(ticket, "  Taille M,\n noir ")] });

  assert.equal(results[0].status, "ADDED");
  const quote = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: results[0].quoteId! } });
  assert.equal(quote.userId, user.id);
  assert.equal(quote.status, "AUTO_APPROVED");
  assert.equal(quote.totalPrice.toString(), "38");
  assert.equal(quote.shippingCost.toString(), "7");
  assert.equal(quote.commissionCost.toString(), "3");
  assert.equal(quote.productWeight?.toString(), "0.5");
  assert.equal(quote.weightSource, "CATALOG_ESTIMATE");
  assert.equal(quote.previewId, payload.id);
  assert.equal(quote.options, "Taille M, noir");
  assert.equal(quote.currency, "USD");
  assert.equal(quote.sourceProductPrice, null);
  assert.equal(quote.sourceCurrency, null);
  assert.equal(quote.exchangeRate, null);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.checkoutReady, true);
});

test("Le PRIX ANNONCÉ est conservé même si les réglages ont changé depuis l'aperçu", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);
  await prisma.globalSettings.updateMany({
    data: { commissionRate: "10", chinaPricePerKg: "12", fixedFee: "5" },
  });

  const { results } = await mergeGuestCart(user.id, { items: [intl(ticket)] });

  const quote = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: results[0].quoteId! } });
  assert.equal(quote.totalPrice.toString(), "38"); // pas 33
  assert.equal(quote.commissionRate?.toString(), "15");
  assert.equal(quote.chinaPricePerKg?.toString(), "14");
  assert.equal(quote.fixedFee?.toString(), "8");
});

test("Ticket sans poids : devis PENDING_REVIEW provisoire, au panier mais NON payable", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie();
  const { ticket } = ticketPour(sub.id, { over: { weightKg: null, weightSource: null } });

  const { results, cart } = await mergeGuestCart(user.id, { items: [intl(ticket)] });

  const quote = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: results[0].quoteId! } });
  assert.equal(quote.status, "PENDING_REVIEW");
  assert.equal(quote.productWeight, null);
  assert.equal(quote.weightSource, null);
  assert.equal(quote.shippingCost.toString(), "0");
  assert.equal(quote.totalPrice.toString(), "31");
  assert.equal(quote.expiresAt, null);
  assert.equal(cart.items[0].payable, false);
  assert.equal(cart.items[0].issue, "PENDING_REVIEW");
  assert.equal(cart.checkoutReady, false);
});

test("La validité de 7 jours part de l'ÉMISSION du ticket, pas de la fusion", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const emission = new Date(Date.now() - 3 * 3600 * 1000); // aperçu fait il y a 3 h
  const { ticket } = ticketPour(sub.id, { now: emission });

  const { results } = await mergeGuestCart(user.id, { items: [intl(ticket)] });

  const quote = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: results[0].quoteId! } });
  const attendu = emission.getTime() + 7 * 24 * 3600 * 1000;
  assert.ok(Math.abs(quote.expiresAt!.getTime() - attendu) < 2000);
});

test("Rejouer la même fusion ne crée AUCUN second devis (idempotence des tickets)", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);

  const premiere = await mergeGuestCart(user.id, { items: [intl(ticket)] });
  const seconde = await mergeGuestCart(user.id, { items: [intl(ticket)] });

  assert.equal(premiere.results[0].status, "ADDED");
  assert.equal(seconde.results[0].status, "ALREADY_IN_CART");
  assert.equal(seconde.results[0].quoteId, premiere.results[0].quoteId);
  assert.equal(await prisma.internationalQuote.count(), 1);
  assert.equal(await prisma.cartItem.count(), 1);
});

test("Deux fusions SIMULTANÉES avec le même ticket : un seul devis", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);

  await Promise.allSettled([
    mergeGuestCart(user.id, { items: [intl(ticket)] }),
    mergeGuestCart(user.id, { items: [intl(ticket)] }),
  ]);

  assert.equal(await prisma.internationalQuote.count(), 1);
  assert.equal(await prisma.cartItem.count(), 1);
});

test("Un ticket déjà utilisé par UN AUTRE compte est refusé (aucun devis créé pour le second)", async () => {
  await assurerReglages();
  const a = await creerUtilisateur();
  const b = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);
  await mergeGuestCart(a.id, { items: [intl(ticket)] });

  const { results } = await mergeGuestCart(b.id, { items: [intl(ticket)] });

  assert.equal(results[0].status, "REJECTED");
  assert.match(results[0].reason ?? "", /déjà été utilisé/);
  assert.equal(await prisma.internationalQuote.count({ where: { userId: b.id } }), 0);
  assert.equal(await prisma.cartItem.count({ where: { cart: { userId: b.id } } }), 0);
});

test("Ticket falsifié (prix modifié), expiré ou absurde : REJECTED, aucun devis", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const bon = ticketPour(sub.id);
  const [, signature] = bon.ticket.split(".");
  const falsifie = `${Buffer.from(JSON.stringify({ ...bon.payload, productPrice: "1" })).toString("base64url")}.${signature}`;
  const expire = ticketPour(sub.id, { now: new Date(Date.now() - 25 * 3600 * 1000) }).ticket;

  const { results } = await mergeGuestCart(user.id, {
    items: [intl(falsifie), intl(expire), intl("n-importe-quoi")],
  });

  assert.deepEqual(results.map((r) => r.status), ["REJECTED", "REJECTED", "REJECTED"]);
  assert.ok(results.every((r) => /invalide ou expiré/.test(r.reason ?? "")));
  assert.equal(await prisma.internationalQuote.count(), 0);
});

// Même clé que le serveur : permet de fabriquer un ticket VALIDEMENT SIGNÉ mais au contenu inacceptable.
function forger(payload: Record<string, unknown>) {
  const key = crypto.createHash("sha256").update(`quote-preview-ticket-v1|${process.env.JWT_SECRET}`).digest();
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${crypto.createHmac("sha256", key).update(encoded).digest("base64url")}`;
}

test("Ticket signé mais au contenu inacceptable (prix 0, domaine non géré, poids sans source) : REJECTED", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const base = ticketPour(sub.id).payload;
  const nouveauId = () => crypto.randomUUID();

  const { results } = await mergeGuestCart(user.id, {
    items: [
      intl(forger({ ...base, id: nouveauId(), productPrice: "0" })),
      intl(forger({ ...base, id: nouveauId(), productUrl: "https://www.amazon.com/dp/1" })),
      intl(forger({ ...base, id: nouveauId(), weightSource: null })), // poids présent, source absente
    ],
  });

  assert.deepEqual(results.map((r) => r.status), ["REJECTED", "REJECTED", "REJECTED"]);
  assert.equal(await prisma.internationalQuote.count(), 0);
});

test("Sous-catégorie désactivée depuis l'aperçu : REJECTED, aucun devis", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);
  await prisma.subCategory.update({ where: { id: sub.id }, data: { isActive: false } });

  const { results } = await mergeGuestCart(user.id, { items: [intl(ticket)] });

  assert.equal(results[0].status, "REJECTED");
  assert.match(results[0].reason ?? "", /sous-catégorie/);
  assert.equal(await prisma.internationalQuote.count(), 0);
});

test("Ticket dont le devis a été rejeté par un admin : refusé à la réutilisation", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);
  const premiere = await mergeGuestCart(user.id, { items: [intl(ticket)] });
  await rejectQuote(premiere.results[0].quoteId!, admin.id, "Produit interdit");
  await prisma.cartItem.deleteMany();

  const { results } = await mergeGuestCart(user.id, { items: [intl(ticket)] });

  assert.equal(results[0].status, "REJECTED");
  assert.match(results[0].reason ?? "", /rejeté/);
  assert.equal(await prisma.cartItem.count(), 0);
});

test("Ticket dont le devis est déjà dans une commande : refusé (pas de double commande)", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);
  await mergeGuestCart(user.id, { items: [intl(ticket)] });
  await createOrderFromCart(user.id);

  const { results } = await mergeGuestCart(user.id, { items: [intl(ticket)] });

  assert.equal(results[0].status, "REJECTED");
  assert.match(results[0].reason ?? "", /déjà dans une commande/);
  assert.equal(await prisma.internationalQuote.count(), 1);
});

// =============== Panier mixte, résultats, validation ===============

test("Panier invité mixte : chaque article est traité séparément, résultats dans l'ordre d'envoi", async () => {
  await assurerReglages();
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 10 });
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { ticket } = ticketPour(sub.id);

  const { results, cart } = await mergeGuestCart(user.id, {
    items: [
      intl("ticket-casse"),
      local(produit.id, 2),
      local("inexistant", 1),
      intl(ticket),
    ],
  });

  assert.deepEqual(results.map((r) => r.index), [0, 1, 2, 3]);
  assert.deepEqual(results.map((r) => r.status), ["REJECTED", "ADDED", "REJECTED", "ADDED"]);
  assert.deepEqual(results.map((r) => r.type), ["INTERNATIONAL", "LOCAL", "LOCAL", "INTERNATIONAL"]);
  assert.equal(cart.items.length, 2);
  assert.equal(cart.estimatedTotal, "58"); // 2 x 10 $ (produit local de test) + 38 $ (devis)
});

test("Panier invité vide : aucune erreur, le panier du compte est créé", async () => {
  const user = await creerUtilisateur();

  const { results, cart } = await mergeGuestCart(user.id, { items: [] });

  assert.deepEqual(results, []);
  assert.equal(cart.items.length, 0);
  assert.equal(cart.checkoutReady, false);
});

test("Plus de 50 articles, formes invalides, types inconnus : MergeInputError, rien n'est modifié", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 10 });

  const invalides: unknown[] = [
    { items: Array.from({ length: 51 }, () => local(produit.id, 1)) },
    {},
    { items: "pas un tableau" },
    null,
    "texte",
    { items: [{ type: "AUTRE", productId: produit.id, quantity: 1 }] },
    { items: [{ type: "LOCAL", productId: produit.id, quantity: 0 }] },
    { items: [{ type: "LOCAL", productId: produit.id, quantity: -2 }] },
    { items: [{ type: "LOCAL", productId: produit.id, quantity: 1.5 }] },
    { items: [{ type: "LOCAL", productId: produit.id, quantity: "2" }] },
    { items: [{ type: "LOCAL", productId: produit.id, quantity: 1000 }] },
    { items: [{ type: "LOCAL", quantity: 1 }] },
    { items: [{ type: "LOCAL", productId: produit.id, quantity: 1, price: 0 }] },
    { items: [{ type: "INTERNATIONAL" }] },
    { items: [{ type: "INTERNATIONAL", ticket: "" }] },
    { items: [{ type: "INTERNATIONAL", ticket: "t", totalPrice: 1 }] },
    { items: [], extra: true },
  ];

  for (const body of invalides) {
    await assert.rejects(mergeGuestCart(user.id, body), MergeInputError, JSON.stringify(body)?.slice(0, 60));
  }
  assert.equal(await prisma.cartItem.count(), 0);
});

test("Exactement 50 articles : accepté", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 1000 });

  const { results } = await mergeGuestCart(user.id, {
    items: Array.from({ length: 50 }, () => local(produit.id, 1)),
  });

  assert.equal(results.length, 50);
  assert.equal(await quantiteLocale(user.id, produit.id), 50);
});