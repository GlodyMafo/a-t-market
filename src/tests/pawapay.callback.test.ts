import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { FakePawapay } from "./helpers/fakePawapay";
import { creerCommande, creerPaiement } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";
import { reconcilePendingPayments } from "../services/payment.reconciliation.service";

const pawapay = new FakePawapay();
let server: Server;
let baseUrl = "";

before(async () => {
  await startTestDb();
  await pawapay.start();
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await pawapay.stop();
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  pawapay.reset();
});

function callback(body: unknown) {
  return fetch(`${baseUrl}/api/payments/pawapay/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function etat(orderId: string, paymentId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return { order: order.status, payment: payment.status };
}

test("CALLBACK FORGÉ (dit COMPLETED) mais PawaPay dit PROCESSING -> rien ne change", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "PROCESSING" });

  const res = await callback({ depositId, status: "COMPLETED", amount: "34.00", currency: "USD" });

  assert.equal(res.status, 200);
  assert.deepEqual(await etat(order.id, payment.id), {
    order: "PENDING_PAYMENT",
    payment: "PENDING",
  });
});

test("CALLBACK FORGÉ pour un dépôt que PawaPay ne connaît pas -> rien ne change", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  // le faux PawaPay n'a rien programmé : il répond NOT_FOUND

  const res = await callback({ depositId, status: "COMPLETED", amount: "34.00", currency: "USD" });

  assert.equal(res.status, 200);
  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
});

test("Vrai paiement : PawaPay confirme COMPLETED -> PAID", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  const res = await callback({ depositId, status: "COMPLETED" });

  assert.equal(res.status, 200);
  assert.deepEqual(await etat(order.id, payment.id), { order: "PAID", payment: "PAID" });
});

test("Le contenu du callback est ignoré : un body mensonger ne bloque pas un vrai paiement", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  await callback({ depositId, status: "FAILED", amount: "1.00", currency: "EUR" });

  assert.equal((await etat(order.id, payment.id)).payment, "PAID");
});

test("Callback rejoué : reste PAID, un seul appel à PawaPay", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  const r1 = await callback({ depositId });
  const r2 = await callback({ depositId });
  const r3 = await callback({ depositId });

  assert.deepEqual([r1.status, r2.status, r3.status], [200, 200, 200]);
  assert.deepEqual(await etat(order.id, payment.id), { order: "PAID", payment: "PAID" });
  assert.equal(pawapay.calls.length, 1);
});

test("Mauvais montant chez PawaPay -> PENDING + log d'erreur", async () => {
  const { order } = await creerCommande({ total: "34.00" });
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "5.00", currency: "USD" });

  const res = await callback({ depositId });

  assert.equal(res.status, 200);
  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
  const log = await prisma.paymentWebhookLog.findFirstOrThrow({ where: { depositId } });
  assert.match(log.error ?? "", /montant inattendu/);
});

test("Corps sans depositId -> 400", async () => {
  assert.equal((await callback({ status: "COMPLETED" })).status, 400);
});

test("depositId qui n'est pas un UUID -> 400", async () => {
  assert.equal((await callback({ depositId: "n-importe-quoi" })).status, 400);
});

test("Dépôt inconnu de notre base -> 200 et PawaPay n'est pas interrogé", async () => {
  const res = await callback({ depositId: "22222222-2222-4222-8222-222222222222" });
  assert.equal(res.status, 200);
  assert.equal(pawapay.calls.length, 0);
});

test("La réponse ne divulgue aucune donnée de paiement", async () => {
  const { order } = await creerCommande();
  const { depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  const res = await callback({ depositId });

  assert.deepEqual(await res.json(), { success: true });
});

test("PawaPay en panne (HTTP 500) -> 500 pour qu'il réessaie, paiement intact", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.httpStatus = 500;

  const res = await callback({ depositId });

  assert.equal(res.status, 500);
  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
  const log = await prisma.paymentWebhookLog.findFirstOrThrow({ where: { depositId } });
  assert.ok(log.error);
});

test("Le callback est journalisé et marqué traité", async () => {
  const { order } = await creerCommande();
  const { depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  await callback({ depositId });

  const log = await prisma.paymentWebhookLog.findFirstOrThrow({ where: { depositId } });
  assert.equal(log.processed, true);
  assert.ok(log.paymentId);
});

// ---------- Réconciliation ----------

async function vieillir(paymentId: string, heures: number) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: { createdAt: new Date(Date.now() - heures * 3600 * 1000) },
  });
}

test("Réconciliation : paiement PENDING que PawaPay confirme -> PAID", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  await reconcilePendingPayments();

  assert.deepEqual(await etat(order.id, payment.id), { order: "PAID", payment: "PAID" });
});

test("Réconciliation : récent et non final -> reste PENDING", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "PROCESSING" });

  await reconcilePendingPayments();

  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
});

test("Réconciliation : > 24 h et PawaPay sans statut final -> EXPIRED", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "PROCESSING" });
  await vieillir(payment.id, 25);

  await reconcilePendingPayments();

  assert.equal((await etat(order.id, payment.id)).payment, "EXPIRED");
});

test("Réconciliation : > 24 h mais PawaPay dit COMPLETED -> PAID (pas expiré)", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });
  await vieillir(payment.id, 30);

  await reconcilePendingPayments();

  assert.deepEqual(await etat(order.id, payment.id), { order: "PAID", payment: "PAID" });
});

test("Réconciliation : > 24 h avec montant incohérent -> reste PENDING (jamais expiré)", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.setDeposit(depositId, { status: "COMPLETED", amount: "2.00", currency: "USD" });
  await vieillir(payment.id, 30);

  await reconcilePendingPayments();

  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
});

test("Réconciliation : PawaPay indisponible -> paiements intacts, pas de plantage", async () => {
  const { order } = await creerCommande();
  const { payment, depositId } = await creerPaiement(order.id, "34.00");
  pawapay.httpStatus = 500;
  await vieillir(payment.id, 30);

  await reconcilePendingPayments();

  assert.equal((await etat(order.id, payment.id)).payment, "PENDING");
});