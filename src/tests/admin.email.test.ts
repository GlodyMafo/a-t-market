import "./setup";

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { env } from "../config/env";
import {
  setMailTransport,
  type MailMessage,
  type MailTransport,
} from "../services/email/mailer.service";
import { buildAdminAlert, notifyAdmin } from "../services/admin.email.service";

const ADMIN = "admin@example.com";
const ORDER_ID = "cmabc123456789"; // référence affichée : #456789

let envoyes: MailMessage[] = [];
let logs: string[] = [];
const originalError = console.error;

function transport(impl?: () => Promise<{ messageId?: string }>): MailTransport {
  return {
    async send(message) {
      envoyes.push(message);
      return impl ? impl() : { messageId: "id-test" };
    },
  };
}

function note(type: string, data: Record<string, unknown> = {}, orderId: string | null = ORDER_ID) {
  return {
    type,
    orderId,
    data,
    createdAt: new Date("2026-11-05T10:00:00Z"),
  } as Parameters<typeof notifyAdmin>[0];
}

beforeEach(() => {
  envoyes = [];
  logs = [];
  console.error = (...args: unknown[]) => void logs.push(args.join(" "));
  setMailTransport(transport());
  env.ADMIN_NOTIFICATION_EMAIL = ADMIN;
});

afterEach(() => {
  console.error = originalError;
  setMailTransport(null);
  env.ADMIN_NOTIFICATION_EMAIL = undefined;
});

test("Variable vide : aucun envoi, quel que soit l'événement", async () => {
  env.ADMIN_NOTIFICATION_EMAIL = undefined;
  await notifyAdmin(note("ORDER_CREATED", { totalAmount: "34.00" }));
  await notifyAdmin(note("PAYMENT_FAILED", { amount: "10.00" }));
  assert.equal(envoyes.length, 0);
});

test("Variable renseignée : un seul e-mail par événement, adressé à l'administrateur", async () => {
  const cas: Array<[ReturnType<typeof note>, RegExp]> = [
    [note("ORDER_CREATED", { totalAmount: "34.00" }), /Nouvelle commande #456789/],
    [note("PAYMENT_CONFIRMED", { orderStatus: "PAID", paidAmount: "34.00" }), /Paiement complet #456789/],
    [note("PAYMENT_CONFIRMED", { orderStatus: "PARTIALLY_PAID", paidAmount: "10.00", remainingAmount: "24.00" }), /Paiement partiel #456789/],
    [note("PAYMENT_FAILED", { amount: "10.00" }), /Paiement échoué #456789/],
    [note("ORDER_CANCELLED"), /Commande annulée #456789/],
  ];

  for (const [n, sujet] of cas) {
    envoyes = [];
    await notifyAdmin(n);
    assert.equal(envoyes.length, 1);
    assert.equal(envoyes[0].to, ADMIN);
    assert.match(envoyes[0].subject, sujet);
    assert.match(envoyes[0].subject, /^\[A&T Market\]/);
  }
});

test("Paiement partiel : le reste à payer est indiqué ; paiement complet : non", () => {
  const partiel = buildAdminAlert(
    note("PAYMENT_CONFIRMED", { orderStatus: "PARTIALLY_PAID", paidAmount: "10", remainingAmount: "24" })
  );
  const complet = buildAdminAlert(note("PAYMENT_CONFIRMED", { orderStatus: "PAID", paidAmount: "34" }));
  assert.ok(partiel?.lines.some((l) => l.includes("24.00 $")));
  assert.ok(!complet?.lines.some((l) => l.includes("Reste")));
});

test("Changement de suivi ou notification sans commande : aucune alerte", async () => {
  await notifyAdmin(note("ORDER_STATUS_CHANGED", { status: "IN_TRANSIT" }));
  await notifyAdmin(note("ORDER_CREATED", { totalAmount: "34.00" }, null));
  assert.equal(envoyes.length, 0);
});

test("Gmail en panne : aucune exception, erreur journalisée sans l'adresse complète", async () => {
  setMailTransport(transport(async () => { throw new Error("connexion refusée"); }));
  await assert.doesNotReject(() => notifyAdmin(note("ORDER_CREATED", { totalAmount: "34.00" })));
  assert.ok(logs.length > 0);
  assert.ok(logs.every((l) => !l.includes(ADMIN)));
});

test("Aucune donnée personnelle ; montants invalides affichés « — » et HTML échappé", async () => {
  await notifyAdmin(
    note("ORDER_CREATED", { totalAmount: "<script>alert(1)</script>", userId: "user-secret-1", email: "client@example.com" })
  );
  const m = envoyes[0];
  assert.ok(!m.text.includes("user-secret-1") && !m.html.includes("user-secret-1"));
  assert.ok(!m.text.includes("client@example.com") && !m.html.includes("client@example.com"));
  assert.ok(!m.html.includes("<script>"));
  assert.match(m.text, /—/);
});