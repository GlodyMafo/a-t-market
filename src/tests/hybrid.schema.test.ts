import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerCommande, creerProduit, creerReglages, creerSousCategorie, creerUtilisateur } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import { createInternationalQuote } from "../services/internationalQuote.service";

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

async function devis(userId: string) {
  await prisma.globalSettings.count().then(async (n) => n === 0 && (await creerReglages()));
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  return createInternationalQuote(userId, "https://www.shein.com/x-p-1.html", "T", 20, sub.id);
}

async function panier(userId: string) {
  return prisma.cart.create({ data: { userId } });
}

// =============== CartItem : soit produit, soit devis ===============

test("Article de panier : produit seul OK, devis seul OK", async () => {
  const user = await creerUtilisateur();
  const cart = await panier(user.id);
  const produit = await creerProduit();
  const q = await devis(user.id);

  await prisma.cartItem.create({ data: { cartId: cart.id, productId: produit.id, quantity: 2 } });
  await prisma.cartItem.create({ data: { cartId: cart.id, quoteId: q.id, quantity: 1 } });

  assert.equal(await prisma.cartItem.count(), 2);
});

test("Article de panier : NI produit NI devis -> refusé par la base", async () => {
  const user = await creerUtilisateur();
  const cart = await panier(user.id);

  await assert.rejects(prisma.cartItem.create({ data: { cartId: cart.id, quantity: 1 } }));
});

test("Article de panier : produit ET devis à la fois -> refusé par la base", async () => {
  const user = await creerUtilisateur();
  const cart = await panier(user.id);
  const produit = await creerProduit();
  const q = await devis(user.id);

  await assert.rejects(
    prisma.cartItem.create({ data: { cartId: cart.id, productId: produit.id, quoteId: q.id, quantity: 1 } })
  );
});

test("Un même devis ne peut être qu'une fois dans le même panier, mais peut être dans deux paniers", async () => {
  const u1 = await creerUtilisateur();
  const u2 = await creerUtilisateur();
  const c1 = await panier(u1.id);
  const c2 = await panier(u2.id);
  const q = await devis(u1.id);

  await prisma.cartItem.create({ data: { cartId: c1.id, quoteId: q.id } });
  await assert.rejects(prisma.cartItem.create({ data: { cartId: c1.id, quoteId: q.id } }));
  await assert.doesNotReject(prisma.cartItem.create({ data: { cartId: c2.id, quoteId: q.id } }));
});

test("Le même produit ne peut toujours pas être deux fois dans un panier (règle existante conservée)", async () => {
  const user = await creerUtilisateur();
  const cart = await panier(user.id);
  const produit = await creerProduit();

  await prisma.cartItem.create({ data: { cartId: cart.id, productId: produit.id } });
  await assert.rejects(prisma.cartItem.create({ data: { cartId: cart.id, productId: produit.id } }));
});

test("Supprimer un devis retire ses articles de panier (cascade)", async () => {
  const user = await creerUtilisateur();
  const cart = await panier(user.id);
  const q = await devis(user.id);
  await prisma.cartItem.create({ data: { cartId: cart.id, quoteId: q.id } });

  await prisma.internationalQuote.delete({ where: { id: q.id } });

  assert.equal(await prisma.cartItem.count(), 0);
});

// =============== OrderItem : soit produit, soit devis ===============

test("Article de commande : produit seul OK, devis seul OK avec copie figée", async () => {
  const { user, order } = await creerCommande();
  const produit = await creerProduit();
  const q = await devis(user.id);

  await prisma.orderItem.create({ data: { orderId: order.id, productId: produit.id, quantity: 1, price: 10 } });
  const item = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      quoteId: q.id,
      quantity: 1,
      price: 38,
      quoteSnapshot: { productUrl: q.productUrl, totalPrice: "38", options: "M" },
    },
  });

  assert.deepEqual(item.quoteSnapshot, { productUrl: q.productUrl, totalPrice: "38", options: "M" });
});

test("Article de commande : NI produit NI devis, ou les DEUX -> refusé par la base", async () => {
  const { user, order } = await creerCommande();
  const produit = await creerProduit();
  const q = await devis(user.id);

  await assert.rejects(prisma.orderItem.create({ data: { orderId: order.id, quantity: 1, price: 10 } }));
  await assert.rejects(
    prisma.orderItem.create({ data: { orderId: order.id, productId: produit.id, quoteId: q.id, quantity: 1, price: 10 } })
  );
});

test("Un devis présent dans une commande ne peut PAS être supprimé (historique protégé)", async () => {
  const { user, order } = await creerCommande();
  const q = await devis(user.id);
  await prisma.orderItem.create({ data: { orderId: order.id, quoteId: q.id, quantity: 1, price: 38 } });

  await assert.rejects(prisma.internationalQuote.delete({ where: { id: q.id } }));
  assert.equal(await prisma.internationalQuote.count({ where: { id: q.id } }), 1);
});

test("Un produit présent dans une commande ne peut toujours pas être supprimé (règle existante conservée)", async () => {
  const { order } = await creerCommande();
  const produit = await creerProduit();
  await prisma.orderItem.create({ data: { orderId: order.id, productId: produit.id, quantity: 1, price: 10 } });

  await assert.rejects(prisma.product.delete({ where: { id: produit.id } }));
});

// =============== previewId, validité, options ===============

test("previewId : unique (un ticket ne crée jamais deux devis), plusieurs vides acceptés", async () => {
  const user = await creerUtilisateur();
  const q1 = await devis(user.id);
  const q2 = await devis(user.id);
  const ticketId = randomUUID();

  await prisma.internationalQuote.update({ where: { id: q1.id }, data: { previewId: ticketId } });
  await assert.rejects(prisma.internationalQuote.update({ where: { id: q2.id }, data: { previewId: ticketId } }));
  assert.equal(await prisma.internationalQuote.count({ where: { previewId: null } }), 1);
});

test("Ancien devis (sans les nouvelles colonnes) : valeurs par défaut cohérentes", async () => {
  const user = await creerUtilisateur();
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "InternationalQuote"
      (id, "userId", "productUrl", "productPrice", "shippingCost", "customsCost", "commissionCost", "totalPrice")
    VALUES (${id}, ${user.id}, 'https://www.shein.com/x', 20, 7, 0, 3, 38)
  `;

  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id } });

  assert.equal(q.expiresAt, null);
  assert.equal(q.options, null);
  assert.equal(q.previewId, null);
});