import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerCommande, creerPaiement } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
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

// Fabrique un faux "statut PawaPay"
const trouve = (
  depositId: string,
  data: { status: string; amount?: string; currency?: string }
) => async () => ({ status: "FOUND", data: { depositId, ...data } });

async function etat(orderId: string, paymentId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return { order: order.status, payment: payment.status };
}

test("COMPLETED avec bon montant -> paiement PAID et commande PAID", async () => {
  const { order } = await creerCommande({ total: "34.00" });
  const { payment, depositId } = await creerPaiement(order.id, "34.00");

  const r = await settlePaymentByDepositId(
    depositId,
    trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" })
  );

  assert.equal(r.outcome, "PAID");
  assert.deepEqual(await etat(order.id, payment.id), { order: "PAID", payment: "PAID" });
});

test("Le montant PawaPay '34' équivaut à 34.00 (pas de faux rejet)", async () => {
  const { order } = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(order.id, "34.00");
  const r = await settlePaymentByDepositId(
    depositId,
    trouve(depositId, { status: "COMPLETED", amount: "34", currency: "USD" })
  );
  assert.equal(r.outcome, "PAID");
});

test("Callback rejoué : second appel = ALREADY_FINAL, PawaPay n'est pas réinterrogé", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  const fetchOk = trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  await settlePaymentByDepositId(depositId, fetchOk);

  let appels = 0;
  const r2 = await settlePaymentByDepositId(depositId, async () => {
    appels++;
    return fetchOk();
  });

  assert.equal(r2.outcome, "ALREADY_FINAL");
  assert.equal(appels, 0);
  assert.deepEqual(await etat(order.id, payment.id), { order: "PAID", payment: "PAID" });
});

test("Deux règlements simultanés du même dépôt : un seul gagne", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  const fetchOk = trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  const resultats = await Promise.all([
    settlePaymentByDepositId(depositId, fetchOk),
    settlePaymentByDepositId(depositId, fetchOk),
    settlePaymentByDepositId(depositId, fetchOk),
  ]);

  const gagnants = resultats.filter((r) => r.outcome === "PAID").length;
  assert.equal(gagnants, 1);
  assert.deepEqual(await etat(order.id, payment.id), { order: "PAID", payment: "PAID" });
});

test("Mauvais montant -> VERIFICATION_FAILED, rien ne passe à PAID", async () => {
  const { order } = await creerCommande({ total: "34.00" });
  const { payment, depositId } = await creerPaiement(order.id, "34.00");

  const r = await settlePaymentByDepositId(
    depositId,
    trouve(depositId, { status: "COMPLETED", amount: "1.00", currency: "USD" })
  );

  assert.equal(r.outcome, "VERIFICATION_FAILED");
  assert.deepEqual(await etat(order.id, payment.id), {
    order: "PENDING_PAYMENT",
    payment: "PENDING",
  });
});

test("Montant absent de la réponse PawaPay -> refusé (on échoue en sécurité)", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");

  const r = await settlePaymentByDepositId(
    depositId,
    trouve(depositId, { status: "COMPLETED", currency: "USD" })
  );

  assert.equal(r.outcome, "VERIFICATION_FAILED");
  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
});

test("Mauvaise devise -> VERIFICATION_FAILED", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");

  const r = await settlePaymentByDepositId(
    depositId,
    trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "CDF" })
  );

  assert.equal(r.outcome, "VERIFICATION_FAILED");
  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
});

test("PawaPay répond avec un autre depositId -> refusé", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");

  const r = await settlePaymentByDepositId(depositId, async () => ({
    status: "FOUND",
    data: {
      depositId: "00000000-0000-4000-8000-000000000000",
      status: "COMPLETED",
      amount: "34.00",
      currency: "USD",
    },
  }));

  assert.equal(r.outcome, "VERIFICATION_FAILED");
  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
});

test("FAILED chez PawaPay -> paiement FAILED, commande inchangée", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");

  const r = await settlePaymentByDepositId(depositId, trouve(depositId, { status: "FAILED" }));

  assert.equal(r.outcome, "FAILED");
  assert.deepEqual(await etat(order.id, payment.id), {
    order: "PENDING_PAYMENT",
    payment: "FAILED",
  });
});

for (const statut of ["ACCEPTED", "PROCESSING", "IN_RECONCILIATION"]) {
  test(`Statut intermédiaire ${statut} -> on attend, rien ne change`, async () => {
    const { order } = await creerCommande();
    const { payment, depositId } = await creerPaiement(order.id, "34.00");

    const r = await settlePaymentByDepositId(depositId, trouve(depositId, { status: statut }));

    assert.equal(r.outcome, "STILL_PENDING");
    assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
  });
}

test("NOT_FOUND chez PawaPay -> on attend", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");

  const r = await settlePaymentByDepositId(depositId, async () => ({ status: "NOT_FOUND" }));

  assert.equal(r.outcome, "STILL_PENDING");
  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
});

test("depositId inconnu -> UNKNOWN_PAYMENT, PawaPay n'est pas appelé", async () => {
  let appels = 0;
  const r = await settlePaymentByDepositId("11111111-1111-4111-8111-111111111111", async () => {
    appels++;
    return { status: "NOT_FOUND" };
  });
  assert.equal(r.outcome, "UNKNOWN_PAYMENT");
  assert.equal(appels, 0);
});

test("Erreur réseau vers PawaPay -> l'erreur remonte, paiement intact", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");

  await assert.rejects(
    settlePaymentByDepositId(depositId, async () => {
      throw new Error("réseau coupé");
    })
  );
  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
});

test("Paiement PRODUCT seul -> commande PARTIALLY_PAID (pas PAID)", async () => {
  const { order } = await creerCommande({ total: "40.00", products: "30.00", shipping: "10.00" });
  const { payment, depositId } = await creerPaiement(order.id, "30.00", "PRODUCT");

  await settlePaymentByDepositId(
    depositId,
    trouve(depositId, { status: "COMPLETED", amount: "30.00", currency: "USD" })
  );

  assert.deepEqual(await etat(order.id, payment.id), {
    order: "PARTIALLY_PAID",
    payment: "PAID",
  });
});

test("PRODUCT puis SHIPPING payés -> commande PAID", async () => {
  const { order } = await creerCommande({ total: "40.00", products: "30.00", shipping: "10.00" });
  const p1 = await creerPaiement(order.id, "30.00", "PRODUCT");
  const p2 = await creerPaiement(order.id, "10.00", "SHIPPING");

  await settlePaymentByDepositId(
    p1.depositId,
    trouve(p1.depositId, { status: "COMPLETED", amount: "30.00", currency: "USD" })
  );
  await settlePaymentByDepositId(
    p2.depositId,
    trouve(p2.depositId, { status: "COMPLETED", amount: "10.00", currency: "USD" })
  );

  assert.deepEqual(await etat(order.id, p2.payment.id), { order: "PAID", payment: "PAID" });
});

// NB : sur PGlite ce test ne prouve PAS le verrou FOR UPDATE (vérifié par mutation).
// La preuve du verrou exige une vraie base PostgreSQL (à faire en préproduction).
test("PRODUCT et SHIPPING réglés en même temps -> commande PAID", async () => {
  const { order } = await creerCommande({ total: "40.00", products: "30.00", shipping: "10.00" });
  const p1 = await creerPaiement(order.id, "30.00", "PRODUCT");
  const p2 = await creerPaiement(order.id, "10.00", "SHIPPING");

  await Promise.all([
    settlePaymentByDepositId(
      p1.depositId,
      trouve(p1.depositId, { status: "COMPLETED", amount: "30.00", currency: "USD" })
    ),
    settlePaymentByDepositId(
      p2.depositId,
      trouve(p2.depositId, { status: "COMPLETED", amount: "10.00", currency: "USD" })
    ),
  ]);

  const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(o.status, "PAID");
});

test("Commande annulée : le paiement est enregistré mais la commande reste CANCELLED", async () => {
  const { order } = await creerCommande({ status: "CANCELLED" });
  const { payment, depositId } = await creerPaiement(order.id, "34.00");

  const r = await settlePaymentByDepositId(
    depositId,
    trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" })
  );

  assert.equal(r.outcome, "PAID");
  assert.deepEqual(await etat(order.id, payment.id), { order: "CANCELLED", payment: "PAID" });
});