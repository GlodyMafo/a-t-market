import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import {
  creerAdmin,
  creerDevis,
  creerProduit,
  creerUtilisateur,
  remplirPanier,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import {
  addQuoteToCart,
  addToCart,
  getCartByUser,
  removeCartItem,
  updateCartItemQuantity,
} from "../services/cart.service";
import { createOrderFromCart } from "../services/order.service";
import { expireUnpaidOrders } from "../services/order.expiration.service";
import { rejectQuote } from "../services/internationalQuote.admin.service";

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

// =============== Ajout d'un devis au panier ===============

test("Un devis payable (validé) est ajouté au panier : 1 article, quantité 1", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);

  const r = await addQuoteToCart(user.id, quote.id);

  assert.equal(r.status, "ADDED");
  const items = await prisma.cartItem.findMany();
  assert.equal(items.length, 1);
  assert.equal(items[0].quoteId, quote.id);
  assert.equal(items[0].productId, null);
  assert.equal(items[0].quantity, 1);
});

test("Ajouter deux fois le même devis : aucun doublon (ALREADY_IN_CART)", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);

  const a = await addQuoteToCart(user.id, quote.id);
  const b = await addQuoteToCart(user.id, quote.id);

  assert.equal(b.status, "ALREADY_IN_CART");
  assert.equal(b.itemId, a.itemId);
  assert.equal(await prisma.cartItem.count(), 1);
});

test("Deux ajouts simultanés du même devis : un seul article", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);

  await Promise.allSettled([addQuoteToCart(user.id, quote.id), addQuoteToCart(user.id, quote.id)]);

  assert.equal(await prisma.cartItem.count(), 1);
});

test("Un devis EN ATTENTE peut entrer dans le panier mais est marqué non payable", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id, { avecPoids: false });
  assert.equal(quote.status, "PENDING_REVIEW");

  await addQuoteToCart(user.id, quote.id);
  const cart = await getCartByUser(user.id);

  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].kind, "INTERNATIONAL");
  assert.equal(cart.items[0].payable, false);
  assert.equal(cart.items[0].issue, "PENDING_REVIEW");
  assert.equal(cart.checkoutReady, false);
  assert.equal(cart.estimatedTotal, "0"); // un prix provisoire n'est jamais compté
});

test("Un devis rejeté ne peut pas être ajouté", async () => {
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const quote = await creerDevis(user.id);
  await rejectQuote(quote.id, admin.id, "Article interdit");

  await assert.rejects(addQuoteToCart(user.id, quote.id), /rejeté/);
  assert.equal(await prisma.cartItem.count(), 0);
});

test("Un devis périmé ne peut pas être ajouté", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);
  await prisma.internationalQuote.update({
    where: { id: quote.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  await assert.rejects(addQuoteToCart(user.id, quote.id), /expiré/);
});

test("Un ancien devis (sans date de fin) de plus de 7 jours est périmé", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);
  await prisma.internationalQuote.update({
    where: { id: quote.id },
    data: { expiresAt: null, createdAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) },
  });

  await assert.rejects(addQuoteToCart(user.id, quote.id), /expiré/);
});

test("Devis d'un AUTRE client, inconnu ou identifiant absurde : même message, rien n'est révélé", async () => {
  const proprietaire = await creerUtilisateur();
  const intrus = await creerUtilisateur();
  const quote = await creerDevis(proprietaire.id);

  for (const id of [quote.id, "inexistant", "", null, undefined, 42, {}, "x".repeat(101)]) {
    await assert.rejects(addQuoteToCart(intrus.id, id), /^Error: Devis introuvable$/, String(id));
  }
  assert.equal(await prisma.cartItem.count(), 0);
});

test("Un devis déjà dans une commande active ne peut pas être ré-ajouté ; après annulation de la commande, oui", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);
  await addQuoteToCart(user.id, quote.id);
  const order = await createOrderFromCart(user.id);

  await assert.rejects(addQuoteToCart(user.id, quote.id), /déjà dans une commande/);

  // la commande n'est jamais payée : elle expire et le devis redevient disponible
  await prisma.order.update({
    where: { id: order.id },
    data: { createdAt: new Date(Date.now() - 2 * 3600 * 1000) },
  });
  assert.equal(await expireUnpaidOrders(), 1);

  const r = await addQuoteToCart(user.id, quote.id);
  assert.equal(r.status, "ADDED");
});

// =============== Lecture du panier hybride ===============

test("Panier mixte : produit local + devis, indicateurs et total des articles payables", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 5, price: "520.00", margin: "15.00" });
  await addToCart({ userId: user.id, productId: produit.id, quantity: 1 });
  const quote = await creerDevis(user.id);
  await addQuoteToCart(user.id, quote.id);

  const cart = await getCartByUser(user.id);

  assert.equal(cart.items.length, 2);
  assert.ok(cart.items.every((i) => i.payable && i.issue === null));
  assert.equal(cart.checkoutReady, true);
  assert.equal(cart.estimatedTotal, "573"); // 535 + 38
  const articleDevis = cart.items.find((i) => i.kind === "INTERNATIONAL")!;
  assert.equal(articleDevis.quote?.totalPrice.toString(), "38");
  assert.equal(articleDevis.product, null);
  const articleLocal = cart.items.find((i) => i.kind === "LOCAL")!;
  assert.equal(articleLocal.quote, null);
});

test("Le panier n'expose que les champs utiles d'un devis (pas d'identifiants internes)", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);
  await addQuoteToCart(user.id, quote.id);

  const cart = await getCartByUser(user.id);
  const q = cart.items[0].quote as Record<string, unknown>;

  assert.equal("userId" in q, false);
  assert.equal("previewId" in q, false);
  assert.equal("commissionRate" in q, false);
  assert.ok("productUrl" in q && "totalPrice" in q && "options" in q);
});

test("Produit local épuisé ou désactivé après ajout : signalé non payable", async () => {
  const user = await creerUtilisateur();
  const p1 = await creerProduit({ stock: 3, name: "Casque" });
  const p2 = await creerProduit({ stock: 3, name: "Souris" });
  await addToCart({ userId: user.id, productId: p1.id, quantity: 3 });
  await addToCart({ userId: user.id, productId: p2.id, quantity: 1 });
  await prisma.inventory.update({ where: { productId: p1.id }, data: { quantity: 1 } });
  await prisma.product.update({ where: { id: p2.id }, data: { isActive: false } });

  const cart = await getCartByUser(user.id);

  const issues = Object.fromEntries(cart.items.map((i) => [i.product?.name, i.issue]));
  assert.equal(issues["Casque"], "OUT_OF_STOCK");
  assert.equal(issues["Souris"], "UNAVAILABLE");
  assert.equal(cart.checkoutReady, false);
  assert.equal(cart.estimatedTotal, "0");
});

test("Un admin rejette un devis déjà dans un panier : le panier le signale REJECTED", async () => {
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const quote = await creerDevis(user.id);
  await addQuoteToCart(user.id, quote.id);
  await rejectQuote(quote.id, admin.id, "Produit non conforme");

  const cart = await getCartByUser(user.id);

  assert.equal(cart.items[0].issue, "REJECTED");
  assert.equal(cart.checkoutReady, false);
});

test("Un devis qui expire pendant qu'il est dans le panier est signalé EXPIRED", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);
  await addQuoteToCart(user.id, quote.id);
  await prisma.internationalQuote.update({
    where: { id: quote.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const cart = await getCartByUser(user.id);

  assert.equal(cart.items[0].issue, "EXPIRED");
});

test("Panier vide ou inexistant : erreur claire", async () => {
  const user = await creerUtilisateur();
  await assert.rejects(getCartByUser(user.id), /Panier introuvable/);
});

test("Panier avec articles locaux seulement : comportement inchangé", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 4, price: "10.00" });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 2 }]);

  const cart = await getCartByUser(user.id);

  assert.equal(cart.items[0].kind, "LOCAL");
  assert.equal(cart.items[0].quantity, 2);
  assert.equal(cart.estimatedTotal, "20");
  assert.equal(cart.checkoutReady, true);
});

// =============== Modification / suppression d'un article-devis ===============

test("La quantité d'un article-devis ne peut pas être modifiée", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);
  const { itemId } = await addQuoteToCart(user.id, quote.id) as { itemId: string };

  await assert.rejects(updateCartItemQuantity(itemId, 3, user.id), /ne peut pas être modifiée/);
});

test("Un article-devis peut être retiré du panier (le devis reste enregistré)", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);
  const { itemId } = await addQuoteToCart(user.id, quote.id) as { itemId: string };

  await removeCartItem(itemId, user.id);

  assert.equal(await prisma.cartItem.count(), 0);
  assert.equal(await prisma.internationalQuote.count(), 1);
});

test("Un client ne peut pas retirer l'article de panier d'un autre client", async () => {
  const user = await creerUtilisateur();
  const autre = await creerUtilisateur();
  const quote = await creerDevis(user.id);
  const { itemId } = await addQuoteToCart(user.id, quote.id) as { itemId: string };

  await assert.rejects(removeCartItem(itemId, autre.id), /introuvable ou accès refusé/);
  assert.equal(await prisma.cartItem.count(), 1);
});