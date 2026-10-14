import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import {
  creerCommande,
  creerPaiement,
  creerProduit,
  creerUtilisateur,
  remplirPanier,
  stockDe,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import { createOrderFromCart } from "../services/order.service";
import { expireUnpaidOrders } from "../services/order.expiration.service";
import { releaseStockForOrder } from "../services/inventory.service";
import { addToCart, updateCartItemQuantity } from "../services/cart.service";
import { getProducts, getProductById } from "../services/product.service";
import { restockInventory, updateInventory } from "../services/admin.service";
import { settlePaymentByDepositId } from "../services/payment.settlement.service";

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

// =============== Réservation à la création de commande ===============

test("Commande : le stock est réservé, la trace est écrite, le panier est vidé, les montants sont exacts", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 5, price: "520.00", margin: "15.00" });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 2 }]);

  const order = await createOrderFromCart(user.id);

  assert.equal(await stockDe(produit.id), 3);
  assert.equal(Number(order.productsAmount), 1070);
  assert.equal(Number(order.totalAmount), 1070);
  assert.equal(order.status, "PENDING_PAYMENT");

  const mouvement = await prisma.inventoryMovement.findFirstOrThrow({
    where: { productId: produit.id },
  });
  assert.equal(mouvement.type, "OUT");
  assert.equal(mouvement.quantity, 2);
  assert.equal(mouvement.reason, `ORDER_RESERVED:${order.id}`);

  assert.equal(await prisma.cartItem.count(), 0);
});

test("Stock insuffisant : commande refusée, stock et panier intacts", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 1, name: "Iphone" });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 2 }]);

  await assert.rejects(createOrderFromCart(user.id), /Stock insuffisant pour « Iphone »/);

  assert.equal(await stockDe(produit.id), 1);
  assert.equal(await prisma.order.count(), 0);
  assert.equal(await prisma.cartItem.count(), 1);
});

test("Panier de deux produits dont le second manque : rien n'est retiré (annulation complète)", async () => {
  const user = await creerUtilisateur();
  const a = await creerProduit({ stock: 10, name: "A" });
  const b = await creerProduit({ stock: 0, name: "B" });
  await remplirPanier(user.id, [
    { productId: a.id, quantity: 3 },
    { productId: b.id, quantity: 1 },
  ]);

  await assert.rejects(createOrderFromCart(user.id), /Stock insuffisant/);

  assert.equal(await stockDe(a.id), 10);
  assert.equal(await prisma.order.count(), 0);
  assert.equal(await prisma.inventoryMovement.count(), 0);
});

test("Dernière unité demandée par deux clients : un seul gagne, le stock ne devient jamais négatif", async () => {
  const u1 = await creerUtilisateur();
  const u2 = await creerUtilisateur();
  const produit = await creerProduit({ stock: 1 });
  await remplirPanier(u1.id, [{ productId: produit.id, quantity: 1 }]);
  await remplirPanier(u2.id, [{ productId: produit.id, quantity: 1 }]);

  const r = await Promise.allSettled([
    createOrderFromCart(u1.id),
    createOrderFromCart(u2.id),
  ]);

  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await stockDe(produit.id), 0);
});

// NB : sur PGlite ce test ne prouve PAS le verrou de panier (vérifié par mutation).
test("Double clic sur Commander : une seule commande, stock réservé une seule fois", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 10 });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 2 }]);

  const r = await Promise.allSettled([
    createOrderFromCart(user.id),
    createOrderFromCart(user.id),
  ]);

  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await prisma.order.count(), 1);
  assert.equal(await stockDe(produit.id), 8);
});

test("Produit désactivé dans le panier : commande refusée", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ isActive: false, name: "Ancien" });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 1 }]);

  await assert.rejects(createOrderFromCart(user.id), /n'est plus disponible/);
  assert.equal(await stockDe(produit.id), 5);
});

test("Montants en centimes : 3 x (0.10 + 0.20) = 0.90 exactement", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ price: "0.10", margin: "0.20" });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 3 }]);

  const order = await createOrderFromCart(user.id);

  assert.equal(order.totalAmount.toString(), "0.9");
});

test("Produit international du catalogue : pas de stock local, la commande passe", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ type: "INTERNATIONAL" });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 1 }]);

  const order = await createOrderFromCart(user.id);

  assert.equal(order.status, "PENDING_PAYMENT");
  assert.equal(await prisma.inventoryMovement.count(), 0);
});

test("Le règlement d'un paiement ne retire PAS le stock une seconde fois", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 5, price: "34.00" });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 1 }]);
  const order = await createOrderFromCart(user.id);
  const { depositId } = await creerPaiement(order.id, "34.00");

  const r = await settlePaymentByDepositId(depositId, async () => ({
    status: "FOUND",
    data: { depositId, status: "COMPLETED", amount: "34.00", currency: "USD" },
  }));

  assert.equal(r.outcome, "PAID");
  assert.equal(await stockDe(produit.id), 4); // réservé à la commande, pas retiré à nouveau
});

// =============== Expiration des réservations ===============

async function commandeReservee(opts?: { stock?: number; quantity?: number }) {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: opts?.stock ?? 5, price: "10.00" });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: opts?.quantity ?? 2 }]);
  const order = await createOrderFromCart(user.id);
  return { user, produit, order };
}

async function vieillirCommande(orderId: string, minutes: number) {
  await prisma.order.update({
    where: { id: orderId },
    data: { createdAt: new Date(Date.now() - minutes * 60 * 1000) },
  });
}

test("Expiration : commande non payée de plus de 60 min -> CANCELLED et stock remis", async () => {
  const { produit, order } = await commandeReservee({ stock: 5, quantity: 2 });
  assert.equal(await stockDe(produit.id), 3);
  await vieillirCommande(order.id, 61);

  const n = await expireUnpaidOrders();

  assert.equal(n, 1);
  assert.equal(await stockDe(produit.id), 5);
  const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(o.status, "CANCELLED");
  const m = await prisma.inventoryMovement.findFirstOrThrow({
    where: { reason: `ORDER_RELEASED:${order.id}` },
  });
  assert.equal(m.type, "IN");
});

test("Expiration lancée plusieurs fois : le stock n'est remis qu'une seule fois", async () => {
  const { produit, order } = await commandeReservee({ stock: 5, quantity: 2 });
  await vieillirCommande(order.id, 90);

  await expireUnpaidOrders();
  await expireUnpaidOrders();
  await expireUnpaidOrders();

  assert.equal(await stockDe(produit.id), 5);
});

test("Libération directe répétée : idempotente", async () => {
  const { produit, order } = await commandeReservee({ stock: 5, quantity: 2 });

  await prisma.$transaction((tx) => releaseStockForOrder(tx, order.id));
  await prisma.$transaction((tx) => releaseStockForOrder(tx, order.id));

  assert.equal(await stockDe(produit.id), 5);
});

test("Commande de moins de 60 min : pas expirée", async () => {
  const { produit, order } = await commandeReservee({ stock: 5, quantity: 2 });
  await vieillirCommande(order.id, 59);

  assert.equal(await expireUnpaidOrders(), 0);
  assert.equal(await stockDe(produit.id), 3);
});

test("Paiement PENDING en cours : la commande n'est PAS expirée", async () => {
  const { produit, order } = await commandeReservee({ stock: 5, quantity: 2 });
  await creerPaiement(order.id, "20.00");
  await vieillirCommande(order.id, 120);

  assert.equal(await expireUnpaidOrders(), 0);
  assert.equal(await stockDe(produit.id), 3);
});

test("Seulement des paiements FAILED : la commande expire", async () => {
  const { produit, order } = await commandeReservee({ stock: 5, quantity: 2 });
  const { payment } = await creerPaiement(order.id, "20.00");
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
  await vieillirCommande(order.id, 120);

  assert.equal(await expireUnpaidOrders(), 1);
  assert.equal(await stockDe(produit.id), 5);
});

test("Commande payée : jamais expirée, stock conservé", async () => {
  const { produit, order } = await commandeReservee({ stock: 5, quantity: 2 });
  await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
  await vieillirCommande(order.id, 500);

  assert.equal(await expireUnpaidOrders(), 0);
  assert.equal(await stockDe(produit.id), 3);
});

test("Commande PARTIALLY_PAID : jamais expirée", async () => {
  const { produit, order } = await commandeReservee({ stock: 5, quantity: 2 });
  await prisma.order.update({ where: { id: order.id }, data: { status: "PARTIALLY_PAID" } });
  await vieillirCommande(order.id, 500);

  assert.equal(await expireUnpaidOrders(), 0);
  assert.equal(await stockDe(produit.id), 3);
});

// =============== Panier ===============

test("Panier : ajout au-delà du stock refusé, dans la limite accepté", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 3, name: "Casque" });

  await assert.rejects(
    addToCart({ userId: user.id, productId: produit.id, quantity: 4 }),
    /Stock insuffisant pour « Casque » : 3 disponible/
  );
  const item = await addToCart({ userId: user.id, productId: produit.id, quantity: 3 });
  assert.equal(item.quantity, 3);
});

test("Panier : le cumul des ajouts est contrôlé", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 3 });

  await addToCart({ userId: user.id, productId: produit.id, quantity: 2 });
  await assert.rejects(
    addToCart({ userId: user.id, productId: produit.id, quantity: 2 }),
    /Stock insuffisant/
  );
});

test("Panier : produit en rupture ou désactivé refusé", async () => {
  const user = await creerUtilisateur();
  const rupture = await creerProduit({ stock: 0, name: "Rupture" });
  const inactif = await creerProduit({ isActive: false, name: "Inactif" });

  await assert.rejects(
    addToCart({ userId: user.id, productId: rupture.id, quantity: 1 }),
    /rupture de stock/
  );
  await assert.rejects(
    addToCart({ userId: user.id, productId: inactif.id, quantity: 1 }),
    /n'est plus disponible/
  );
});

test("Panier : quantité non entière ou négative refusée", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit();

  for (const quantity of [0, -1, 1.5, NaN, "2" as unknown as number]) {
    await assert.rejects(
      addToCart({ userId: user.id, productId: produit.id, quantity }),
      /entier supérieur à 0/
    );
  }
});

test("Panier : modification de quantité contrôlée par le stock", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 3 });
  const item = await addToCart({ userId: user.id, productId: produit.id, quantity: 1 });

  await assert.rejects(updateCartItemQuantity(item.id, 4, user.id), /Stock insuffisant/);
  const ok = await updateCartItemQuantity(item.id, 3, user.id);
  assert.equal(ok.quantity, 3);
});

test("Panier : produit international ajouté sans contrôle de stock local", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ type: "INTERNATIONAL" });

  const item = await addToCart({ userId: user.id, productId: produit.id, quantity: 5 });
  assert.equal(item.quantity, 5);
});

// =============== Visibilité (règle 4.14) ===============

test("Catalogue : produit LOCAL à stock 0 masqué, inactif masqué, international visible", async () => {
  const visible = await creerProduit({ stock: 2, name: "Visible" });
  await creerProduit({ stock: 0, name: "Rupture" });
  await creerProduit({ stock: 5, isActive: false, name: "Inactif" });
  const intl = await creerProduit({ type: "INTERNATIONAL", name: "Intl" });

  const noms = (await getProducts()).map((p) => p.name).sort();

  assert.deepEqual(noms, ["Intl", "Visible"]);
  assert.ok(visible.id && intl.id);
});

test("Catalogue : un produit qui tombe à 0 disparaît, et réapparaît au réapprovisionnement", async () => {
  const produit = await creerProduit({ stock: 1, name: "Dernier" });
  const user = await creerUtilisateur();
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 1 }]);

  await createOrderFromCart(user.id);
  assert.equal((await getProducts()).length, 0);

  await restockInventory(produit.id, 4);
  assert.equal((await getProducts()).length, 1);
});

test("Détail produit : introuvable si stock 0 ou inactif", async () => {
  const rupture = await creerProduit({ stock: 0 });
  const inactif = await creerProduit({ isActive: false });
  const ok = await creerProduit({ stock: 1 });

  await assert.rejects(getProductById(rupture.id), /Produit introuvable/);
  await assert.rejects(getProductById(inactif.id), /Produit introuvable/);
  assert.equal((await getProductById(ok.id)).id, ok.id);
});

// =============== Stock côté admin ===============

test("Admin : réapprovisionnement atomique et tracé", async () => {
  const produit = await creerProduit({ stock: 2 });

  const inv = await restockInventory(produit.id, 3, "Livraison fournisseur");

  assert.equal(inv.quantity, 5);
  const m = await prisma.inventoryMovement.findFirstOrThrow({ where: { productId: produit.id } });
  assert.equal(m.type, "IN");
  assert.equal(m.quantity, 3);
  assert.equal(m.reason, "Livraison fournisseur");
});

test("Admin : correction de stock tracée avec l'ancienne et la nouvelle valeur", async () => {
  const produit = await creerProduit({ stock: 10 });

  await updateInventory(produit.id, 4);

  assert.equal(await stockDe(produit.id), 4);
  const m = await prisma.inventoryMovement.findFirstOrThrow({ where: { productId: produit.id } });
  assert.equal(m.type, "OUT");
  assert.equal(m.quantity, 6);
  assert.match(m.reason ?? "", /10 → 4/);
});

test("Admin : correction à la même valeur ne crée aucune trace", async () => {
  const produit = await creerProduit({ stock: 7 });

  await updateInventory(produit.id, 7);

  assert.equal(await prisma.inventoryMovement.count(), 0);
});

test("Admin : stock négatif, décimal ou quantité de réappro invalide refusés", async () => {
  const produit = await creerProduit({ stock: 3 });

  await assert.rejects(updateInventory(produit.id, -1), /entier positif ou nul/);
  await assert.rejects(updateInventory(produit.id, 2.5), /entier positif ou nul/);
  await assert.rejects(restockInventory(produit.id, 0), /entier supérieur à 0/);
  await assert.rejects(restockInventory(produit.id, 1.5), /entier supérieur à 0/);
  assert.equal(await stockDe(produit.id), 3);
});

test("Admin : produit sans inventaire -> erreur claire", async () => {
  await assert.rejects(updateInventory("inexistant", 5), /Inventaire introuvable/);
  await assert.rejects(restockInventory("inexistant", 5), /Inventaire introuvable/);
});