import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { FakePawapay } from "./helpers/fakePawapay";
import { creerCommande } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import { createPayment } from "../services/payment.service";

const pawapay = new FakePawapay();

before(async () => {
  await startTestDb();
  await pawapay.start();
});
after(async () => {
  await pawapay.stop();
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  pawapay.reset();
});

const payer = (
  orderId: string,
  userId: string,
  type: "FULL" | "PRODUCT" | "SHIPPING" = "FULL",
  provider = "AIRTEL"
) => createPayment(orderId, userId, "0990000001", provider, type);

test("FULL : paiement PENDING créé, montant = total, identifiant enregistré dès le départ", async () => {
  const { user, order } = await creerCommande({ total: "34.00" });

  const p = await payer(order.id, user.id);

  assert.equal(p.status, "PENDING");
  assert.equal(Number(p.amount), 34);
  assert.equal(pawapay.deposits.length, 1);
  // l'identifiant envoyé à PawaPay est celui qu'on a enregistré
  assert.equal(p.providerReference, pawapay.deposits[0].depositId);
});

test("Un second paiement FULL sur la même commande est refusé", async () => {
  const { user, order } = await creerCommande();
  await payer(order.id, user.id);

  await assert.rejects(payer(order.id, user.id), /complet existe déjà/);
  assert.equal(pawapay.deposits.length, 1);
});

test("FULL puis PRODUCT : refusé (double paiement)", async () => {
  const { user, order } = await creerCommande({ total: "40.00", products: "30.00", shipping: "10.00" });
  await payer(order.id, user.id, "FULL");

  await assert.rejects(payer(order.id, user.id, "PRODUCT"), /complet existe déjà/);
  assert.equal(pawapay.deposits.length, 1);
});

test("PRODUCT puis FULL : refusé (double paiement)", async () => {
  const { user, order } = await creerCommande({ total: "40.00", products: "30.00", shipping: "10.00" });
  await payer(order.id, user.id, "PRODUCT");

  await assert.rejects(payer(order.id, user.id, "FULL"), /paiement partiel existe déjà/);
  assert.equal(pawapay.deposits.length, 1);
});

test("PRODUCT puis SHIPPING : autorisé, montants corrects", async () => {
  const { user, order } = await creerCommande({ total: "40.00", products: "30.00", shipping: "10.00" });

  const p1 = await payer(order.id, user.id, "PRODUCT");
  const p2 = await payer(order.id, user.id, "SHIPPING");

  assert.equal(Number(p1.amount), 30);
  assert.equal(Number(p2.amount), 10);
});

test("Un second PRODUCT est refusé", async () => {
  const { user, order } = await creerCommande({ total: "40.00", products: "30.00", shipping: "10.00" });
  await payer(order.id, user.id, "PRODUCT");

  await assert.rejects(payer(order.id, user.id, "PRODUCT"), /PRODUCT existe déjà/);
});

test("SHIPPING avec transport à 0 : refusé, PawaPay n'est pas appelé", async () => {
  const { user, order } = await creerCommande({ total: "34.00", shipping: "0" });

  await assert.rejects(payer(order.id, user.id, "SHIPPING"), /Aucun montant à payer/);
  assert.equal(pawapay.deposits.length, 0);
});

test("Commande d'un autre client -> introuvable", async () => {
  const { order } = await creerCommande();
  const autre = await creerCommande();

  await assert.rejects(payer(order.id, autre.user.id), /Commande introuvable/);
  assert.equal(pawapay.deposits.length, 0);
});

for (const statut of ["CANCELLED", "PAID"] as const) {
  test(`Commande ${statut} : plus payable`, async () => {
    const { user, order } = await creerCommande({ status: statut });

    await assert.rejects(payer(order.id, user.id), /n'est plus payable/);
    assert.equal(pawapay.deposits.length, 0);
  });
}

test("PawaPay répond REJECTED (HTTP 200) -> paiement FAILED, et on peut réessayer", async () => {
  const { user, order } = await creerCommande();
  pawapay.postResponse = { depositId: "x", status: "REJECTED" };

  await assert.rejects(payer(order.id, user.id), /refusé par PawaPay/);
  const p = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(p.status, "FAILED");

  // un paiement FAILED ne bloque pas une nouvelle tentative
  pawapay.postResponse = null;
  const retry = await payer(order.id, user.id);
  assert.equal(retry.status, "PENDING");
});

test("PawaPay en panne (HTTP 500) -> paiement FAILED, identifiant conservé", async () => {
  const { user, order } = await creerCommande();
  pawapay.postStatus = 500;
  pawapay.postResponse = { errorMessage: "boom" };

  await assert.rejects(payer(order.id, user.id));
  const p = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(p.status, "FAILED");
  assert.ok(p.providerReference);
});

test("Opérateur non supporté -> paiement FAILED, rien n'est envoyé à PawaPay", async () => {
  const { user, order } = await creerCommande();

  await assert.rejects(payer(order.id, user.id, "FULL", "FOO"), /Provider Mobile Money non supporté/);
  const p = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(p.status, "FAILED");
  assert.equal(pawapay.deposits.length, 0);
});

// NB : sur PGlite ce test ne prouve PAS le verrou de commande (vérifié par mutation).
// La preuve exige une vraie base PostgreSQL (à faire en préproduction).
test("Deux demandes FULL simultanées : un seul paiement créé", async () => {
  const { user, order } = await creerCommande();

  const resultats = await Promise.allSettled([
    payer(order.id, user.id),
    payer(order.id, user.id),
  ]);

  const ok = resultats.filter((r) => r.status === "fulfilled").length;
  assert.equal(ok, 1);
  assert.equal(await prisma.payment.count({ where: { orderId: order.id, status: "PENDING" } }), 1);
});