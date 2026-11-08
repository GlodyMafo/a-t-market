import "./setup";

import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerCommande, creerPaiement } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { settlePaymentByDepositId } from "../services/payment.settlement.service";
import { setMailTransport, type MailMessage } from "../services/email/mailer.service";

const ADMIN = "admin@example.com";
let envoyes: MailMessage[] = [];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const trouve = (
  depositId: string,
  data: { status: string; amount?: string; currency?: string }
) => async () => ({ status: "FOUND", data: { depositId, ...data } });

before(async () => { await startTestDb(); });
after(async () => { await prisma.$disconnect(); await stopTestDb(); });

beforeEach(async () => {
  await resetTestDb();
  envoyes = [];
  setMailTransport({ async send(m) { envoyes.push(m); return { messageId: "id-test" }; } });
  env.ADMIN_NOTIFICATION_EMAIL = ADMIN;
});

afterEach(() => {
  setMailTransport(null);
  env.ADMIN_NOTIFICATION_EMAIL = undefined;
});

test("Paiement confirmé puis callback rejoué : un seul e-mail administrateur", async () => {
  const { order } = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(order.id, "34.00");
  const completed = trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  await settlePaymentByDepositId(depositId, completed);
  await settlePaymentByDepositId(depositId, completed);
  await pause(100);

  assert.equal(envoyes.length, 1);
  assert.equal(envoyes[0].to, ADMIN);
  assert.match(envoyes[0].subject, /Paiement complet/);
});

test("Échec confirmé puis rejeu : un seul e-mail administrateur", async () => {
  const { order } = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(order.id, "34.00");
  const failed = trouve(depositId, { status: "FAILED" });

  await settlePaymentByDepositId(depositId, failed);
  await settlePaymentByDepositId(depositId, failed);
  await pause(100);

  assert.equal(envoyes.length, 1);
  assert.match(envoyes[0].subject, /Paiement échoué/);
});

test("Variable vide : le paiement aboutit normalement, aucune alerte", async () => {
  env.ADMIN_NOTIFICATION_EMAIL = undefined;

  const { order } = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(order.id, "34.00");
  const r = await settlePaymentByDepositId(
    depositId,
    trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" })
  );
  await pause(100);

  assert.equal(r.outcome, "PAID");
  assert.equal(envoyes.length, 0);
});