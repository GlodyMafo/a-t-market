import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import {
  creerAdmin, creerCommande, creerDevis, creerPaiement, creerProduit,
  creerUtilisateur, remplirPanier,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import { settlePaymentByDepositId } from "../services/payment.settlement.service";
import { postTrackingEvent } from "../services/orderTracking.service";
import {
  deleteProduct, getAdminDashboard, getAdminStats, getInternationalOrdersToPurchase,
} from "../services/admin.service";
import type { TrackingStatus } from "../../generated/prisma/client";

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

const trouve = (
  depositId: string,
  data: { status: string; amount?: string; currency?: string }
) => async () => ({ status: "FOUND", data: { depositId, ...data } });

/** Commande déjà PAID (sans événement : cas d'une commande payée avant le Lot 5). */
async function commandePayee(kind: "LOCAL" | "INTERNATIONAL") {
  const { user, order } = await creerCommande({ status: "PAID" });
  if (kind === "LOCAL") {
    const p = await creerProduit();
    await prisma.orderItem.create({
      data: { orderId: order.id, productId: p.id, quantity: 1, basePrice: "10", margin: "0", price: "10" },
    });
  } else {
    const q = await creerDevis(user.id);
    await prisma.orderItem.create({
      data: {
        orderId: order.id, quoteId: q.id, quantity: 1,
        basePrice: q.productPrice, margin: "18", price: q.totalPrice,
      },
    });
  }
  const admin = await creerAdmin();
  return { user, order, admin };
}

const poster = (orderId: string, status: TrackingStatus, actorId: string) =>
  postTrackingEvent({ orderId, status, actorId });

async function enchainer(orderId: string, adminId: string, statuts: TrackingStatus[]) {
  for (const s of statuts) await poster(orderId, s, adminId);
}

const code = (c: string) => (e: any) => e.code === c;

async function evenements(orderId: string) {
  return prisma.trackingEvent.findMany({
    where: { orderId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

// =============== Règlement du paiement ===============

test("Paiement complet : l'événement « Commande validée » est créé une seule fois (callback rejoué)", async () => {
  const { order } = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(order.id, "34.00");
  const ok = trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  await settlePaymentByDepositId(depositId, ok);
  await settlePaymentByDepositId(depositId, ok);

  const events = await evenements(order.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "ORDER_VALIDATED");
  assert.equal(events[0].actorId, null);
});

test("Paiement partiel : aucun événement, la commande reste PARTIALLY_PAID", async () => {
  const { order } = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(order.id, "10.00", "PRODUCT");

  await settlePaymentByDepositId(
    depositId,
    trouve(depositId, { status: "COMPLETED", amount: "10.00", currency: "USD" })
  );

  const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(after.status, "PARTIALLY_PAID");
  assert.equal((await evenements(order.id)).length, 0);
});

// =============== Règles de statut ===============

test("« Livré » (ou tout statut) impossible sur une commande non payée", async () => {
  const admin = await creerAdmin();
  for (const status of ["PENDING_PAYMENT", "PARTIALLY_PAID", "CANCELLED"] as const) {
    const { order } = await creerCommande({ status: status as any });
    await assert.rejects(poster(order.id, "DELIVERED", admin.id), (e: any) => e.status === 409);
    await assert.rejects(poster(order.id, "ORDER_VALIDATED", admin.id), (e: any) => e.status === 409);
    assert.equal((await evenements(order.id)).length, 0);
  }
});

test("Commande inconnue -> 404", async () => {
  const admin = await creerAdmin();
  await assert.rejects(poster("inconnue", "ORDER_VALIDATED", admin.id), (e: any) => e.status === 404);
});

test("Parcours local complet : historique, auteur, et commande DELIVERED à la fin", async () => {
  const { order, admin } = await commandePayee("LOCAL");

  await enchainer(order.id, admin.id, ["ORDER_VALIDATED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"]);

  const events = await evenements(order.id);
  assert.deepEqual(events.map((e) => e.status), [
    "ORDER_VALIDATED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED",
  ]);
  assert.deepEqual(events.map((e) => e.fromStatus), [
    null, "ORDER_VALIDATED", "PREPARING", "OUT_FOR_DELIVERY",
  ]);
  assert.ok(events.every((e) => e.actorId === admin.id));

  const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(final.status, "DELIVERED");
});

test("Parcours international complet", async () => {
  const { order, admin } = await commandePayee("INTERNATIONAL");

  await enchainer(order.id, admin.id, [
    "ORDER_VALIDATED", "PURCHASED", "IN_CHINA", "IN_TRANSIT", "ARRIVED_DRC", "DELIVERED",
  ]);

  const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(final.status, "DELIVERED");
});

test("Transition invalide : refusée avec INVALID_TRANSITION, rien n'est écrit", async () => {
  const { order, admin } = await commandePayee("INTERNATIONAL");
  await poster(order.id, "ORDER_VALIDATED", admin.id);

  await assert.rejects(poster(order.id, "IN_CHINA", admin.id), code("INVALID_TRANSITION"));
  await assert.rejects(poster(order.id, "DELIVERED", admin.id), code("INVALID_TRANSITION"));
  await assert.rejects(poster(order.id, "PREPARING", admin.id), code("INVALID_TRANSITION")); // étape locale

  assert.equal((await evenements(order.id)).length, 1);
});

test("Commande livrée : plus aucun changement possible", async () => {
  const { order, admin } = await commandePayee("LOCAL");
  await enchainer(order.id, admin.id, ["ORDER_VALIDATED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"]);

  await assert.rejects(poster(order.id, "PREPARING", admin.id), code("ORDER_ALREADY_DELIVERED"));
});

test("Deux admins postent le même statut en même temps : un seul gagne", async () => {
  const { order, admin } = await commandePayee("INTERNATIONAL");
  await poster(order.id, "ORDER_VALIDATED", admin.id);

  const r = await Promise.allSettled([
    poster(order.id, "PURCHASED", admin.id),
    poster(order.id, "PURCHASED", admin.id),
  ]);

  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await evenements(order.id)).length, 2);
});

// =============== Suppression de produit ===============

test("Produit jamais commandé : supprimé, avec sa ligne de panier", async () => {
  const user = await creerUtilisateur();
  const p = await creerProduit();
  await remplirPanier(user.id, [{ productId: p.id, quantity: 1 }]);

  const r = await deleteProduct(p.id);

  assert.equal(r.deleted, true);
  assert.equal(await prisma.product.count({ where: { id: p.id } }), 0);
  assert.equal(await prisma.cartItem.count(), 0);
});

test("Produit déjà commandé : archivé (désactivé), pas supprimé", async () => {
  const { order } = await creerCommande({ status: "PAID" });
  const p = await creerProduit();
  await prisma.orderItem.create({
    data: { orderId: order.id, productId: p.id, quantity: 1, basePrice: "10", margin: "0", price: "10" },
  });

  const r = await deleteProduct(p.id);

  assert.equal(r.deleted, false);
  assert.equal(r.archived, true);
  const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(after.isActive, false);
});

test("Produit inconnu -> 404", async () => {
  await assert.rejects(deleteProduct("inconnu"), (e: any) => e.status === 404);
});

// =============== Tableau de bord et statistiques ===============

test("Tableau de bord : « à acheter » disparaît dès que l'achat est posté", async () => {
  const { order, admin } = await commandePayee("INTERNATIONAL");
  await poster(order.id, "ORDER_VALIDATED", admin.id);

  let d = await getAdminDashboard();
  assert.equal(d.internationalToPurchase, 1);
  assert.equal(d.localToPrepare, 0);

  const liste = await getInternationalOrdersToPurchase();
  assert.equal(liste.length, 1);
  assert.equal(liste[0].items.length, 1);

  await poster(order.id, "PURCHASED", admin.id);
  d = await getAdminDashboard();
  assert.equal(d.internationalToPurchase, 0);
});

test("Tableau de bord : commandes locales à préparer, devis à valider, ruptures", async () => {
  const { order, admin } = await commandePayee("LOCAL");
  await poster(order.id, "ORDER_VALIDATED", admin.id);

  const user = await creerUtilisateur();
  await creerDevis(user.id, { avecPoids: false }); // PENDING_REVIEW
  await creerProduit({ stock: 0 });

  const d = await getAdminDashboard();
  assert.equal(d.localToPrepare, 1);
  assert.equal(d.quotesPendingReview, 1);
  assert.equal(d.outOfStockProducts, 1);
});

test("Statistiques : une commande livrée compte toujours dans le chiffre d'affaires", async () => {
  await creerCommande({ status: "PAID", total: "34.00" });
  const { order } = await creerCommande({ status: "PAID", total: "34.00" });
  await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });

  const stats = await getAdminStats();
  assert.equal(stats.paidOrders, 2);
  assert.equal(stats.totalRevenue, 68);
});