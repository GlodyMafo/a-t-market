import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import {
  creerAdmin, creerCommande, creerDevis, creerPaiement, creerProduit, creerUtilisateur,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";
import { setRealtimeEmitter } from "../realtime/emitter";
import { settlePaymentByDepositId } from "../services/payment.settlement.service";
import { postTrackingEvent } from "../services/orderTracking.service";

type Emis = { userId: string; event: string; payload: any };
let emis: Emis[] = [];

let server: Server;
let baseUrl = "";

before(async () => {
  await startTestDb();
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  setRealtimeEmitter(null);
  server.close();
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  emis = [];
  setRealtimeEmitter((userId, event, payload) => emis.push({ userId, event, payload }));
});

const trouve = (depositId: string, data: { status: string; amount?: string; currency?: string }) =>
  async () => ({ status: "FOUND", data: { depositId, ...data } });

const journal = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

// ====================== Paiement ======================

test("Paiement complet : une notification « confirmé », envoyée en direct, une seule fois (callback rejoué)", async () => {
  const { user, order } = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(order.id, "34.00");
  const ok = trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" });

  await settlePaymentByDepositId(depositId, ok);
  await settlePaymentByDepositId(depositId, ok);

  const notes = await journal(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].type, "PAYMENT_CONFIRMED");
  assert.equal(notes[0].orderId, order.id);
  assert.equal(notes[0].title, "Paiement confirmé");
  assert.match(notes[0].message, /34\.00 \$/);
  assert.match(notes[0].message, /est validée/);
  assert.equal(notes[0].readAt, null);

  assert.equal(emis.length, 1);
  assert.equal(emis[0].userId, user.id);
  assert.equal(emis[0].event, "notification");
  assert.equal(emis[0].payload.id, notes[0].id);
  assert.equal(emis[0].payload.type, "PAYMENT_CONFIRMED");
  assert.equal("userId" in emis[0].payload, false); // l'identifiant du destinataire ne sort pas dans le message
});

test("Paiement partiel : le client voit ce qu'il reste à payer, puis la commande est validée au second paiement", async () => {
  const { user, order } = await creerCommande({ total: "34.00" });
  const p1 = await creerPaiement(order.id, "10.00", "PRODUCT");
  const p2 = await creerPaiement(order.id, "24.00", "SHIPPING");

  await settlePaymentByDepositId(p1.depositId, trouve(p1.depositId, { status: "COMPLETED", amount: "10.00", currency: "USD" }));
  let notes = await journal(user.id);
  assert.equal(notes.length, 1);
  assert.match(notes[0].message, /Il reste 24\.00 \$ à payer/);
  assert.equal((notes[0].data as any).orderStatus, "PARTIALLY_PAID");
  assert.equal((notes[0].data as any).remainingAmount, "24.00");

  await settlePaymentByDepositId(p2.depositId, trouve(p2.depositId, { status: "COMPLETED", amount: "24.00", currency: "USD" }));
  notes = await journal(user.id);
  assert.equal(notes.length, 2);
  assert.match(notes[1].message, /est validée/);
  assert.equal(emis.length, 2);
});

test("Paiement échoué : le client est prévenu une seule fois", async () => {
  const { user, order } = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(order.id, "34.00");
  const echec = trouve(depositId, { status: "FAILED" });

  await settlePaymentByDepositId(depositId, echec);
  await settlePaymentByDepositId(depositId, echec);

  const notes = await journal(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].type, "PAYMENT_FAILED");
  assert.match(notes[0].message, /n'a pas abouti/);
  assert.equal(emis.length, 1);
});

test("Paiement refusé à la vérification (mauvais montant) ou encore en attente : aucune notification", async () => {
  const { user, order } = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(order.id, "34.00");

  await settlePaymentByDepositId(depositId, trouve(depositId, { status: "COMPLETED", amount: "1.00", currency: "USD" }));
  await settlePaymentByDepositId(depositId, trouve(depositId, { status: "PROCESSING" }));

  assert.equal((await journal(user.id)).length, 0);
  assert.equal(emis.length, 0);
});

// ====================== Suivi de commande ======================

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
      data: { orderId: order.id, quoteId: q.id, quantity: 1, basePrice: q.productPrice, margin: "18", price: q.totalPrice },
    });
  }
  return { user, order, admin: await creerAdmin() };
}

test("Changement de statut : notification au propriétaire de la commande, avec le libellé et le message de l'admin", async () => {
  const { user, order, admin } = await commandePayee("INTERNATIONAL");
  const autre = await creerUtilisateur();

  await postTrackingEvent({ orderId: order.id, status: "ORDER_VALIDATED", actorId: admin.id });
  await postTrackingEvent({ orderId: order.id, status: "PURCHASED", message: "Acheté sur SHEIN", actorId: admin.id });

  const notes = await journal(user.id);
  assert.deepEqual(notes.map((n) => n.title), ["Commande validée", "Produit acheté"]);
  assert.equal(notes[1].type, "ORDER_STATUS_CHANGED");
  assert.match(notes[1].message, /Produit acheté — Acheté sur SHEIN/);
  assert.deepEqual(notes[1].data, { status: "PURCHASED", label: "Produit acheté" });

  assert.deepEqual(emis.map((e) => e.userId), [user.id, user.id]);
  assert.equal((await journal(autre.id)).length, 0);
});

test("Transition refusée : ni notification, ni envoi", async () => {
  const { user, order, admin } = await commandePayee("LOCAL");
  await postTrackingEvent({ orderId: order.id, status: "ORDER_VALIDATED", actorId: admin.id });
  emis = [];

  await assert.rejects(
    postTrackingEvent({ orderId: order.id, status: "DELIVERED", actorId: admin.id }),
    (e: any) => e.code === "INVALID_TRANSITION"
  );

  assert.equal((await journal(user.id)).length, 1);
  assert.equal(emis.length, 0);
});

test("Un envoi temps réel qui échoue ne casse ni le suivi ni le paiement", async () => {
  setRealtimeEmitter(() => {
    throw new Error("socket HS");
  });

  const { user, order, admin } = await commandePayee("LOCAL");
  const event = await postTrackingEvent({ orderId: order.id, status: "ORDER_VALIDATED", actorId: admin.id });
  assert.equal(event.status, "ORDER_VALIDATED");
  assert.equal((await journal(user.id)).length, 1);

  const c = await creerCommande({ total: "34.00" });
  const { depositId } = await creerPaiement(c.order.id, "34.00");
  const r = await settlePaymentByDepositId(depositId, trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" }));
  assert.equal(r.outcome, "PAID");
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: c.order.id } })).status, "PAID");
});

test("Sans serveur temps réel démarré, tout fonctionne (le journal est écrit)", async () => {
  setRealtimeEmitter(null);
  const { user, order, admin } = await commandePayee("LOCAL");
  await postTrackingEvent({ orderId: order.id, status: "ORDER_VALIDATED", actorId: admin.id });
  assert.equal((await journal(user.id)).length, 1);
});

// ====================== API du journal ======================

const token = (userId: string) =>
  jwt.sign({ userId, role: "USER" }, process.env.JWT_SECRET!, { expiresIn: "1h" });

async function http(method: string, path: string, auth?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* pas du JSON */ }
  return { status: res.status, json, text };
}

async function creerNotes(userId: string, n: number) {
  for (let i = 1; i <= n; i++) {
    await prisma.notification.create({
      data: {
        userId,
        type: "ORDER_STATUS_CHANGED",
        title: `N${i}`,
        message: `Message ${i}`,
        createdAt: new Date(`2026-01-0${i}T10:00:00Z`),
      },
    });
  }
}

test("Journal : accès réservé aux utilisateurs connectés", async () => {
  assert.equal((await http("GET", "/api/notifications")).status, 401);
  assert.equal((await http("PATCH", "/api/notifications/read-all")).status, 401);
  assert.equal((await http("PATCH", "/api/notifications/abc/read")).status, 401);
});

test("Journal : chacun ne voit que les siennes, plus récentes d'abord, avec pagination et compteur de non lues", async () => {
  const moi = await creerUtilisateur();
  const autre = await creerUtilisateur();
  await creerNotes(moi.id, 3);
  await creerNotes(autre.id, 2);

  const r = await http("GET", "/api/notifications?limit=2&page=1", token(moi.id));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data.map((n: any) => n.title), ["N3", "N2"]);
  assert.deepEqual(r.json.meta, { page: 1, limit: 2, total: 3, totalPages: 2, unread: 3 });
  assert.equal("userId" in r.json.data[0], false);

  const p2 = await http("GET", "/api/notifications?limit=2&page=2", token(moi.id));
  assert.deepEqual(p2.json.data.map((n: any) => n.title), ["N1"]);
});

test("Journal : lecture d'une notification, idempotente, et réservée à son propriétaire", async () => {
  const moi = await creerUtilisateur();
  const autre = await creerUtilisateur();
  await creerNotes(moi.id, 2);
  await creerNotes(autre.id, 1);
  const [a, b] = await journal(moi.id);
  const [pasLaMienne] = await journal(autre.id);

  const lu = await http("PATCH", `/api/notifications/${a.id}/read`, token(moi.id));
  assert.equal(lu.status, 200);
  assert.ok(lu.json.data.readAt);

  const encore = await http("PATCH", `/api/notifications/${a.id}/read`, token(moi.id));
  assert.equal(encore.json.data.readAt, lu.json.data.readAt); // la première lecture est conservée

  assert.equal((await http("PATCH", `/api/notifications/${pasLaMienne.id}/read`, token(moi.id))).status, 404);
  assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id: pasLaMienne.id } })).readAt, null);
  assert.equal((await http("PATCH", `/api/notifications/inconnue/read`, token(moi.id))).status, 404);
  assert.equal((await http("PATCH", `/api/notifications/${"x".repeat(65)}/read`, token(moi.id))).status, 400);

  const nonLues = await http("GET", "/api/notifications?unread=true", token(moi.id));
  assert.deepEqual(nonLues.json.data.map((n: any) => n.id), [b.id]);
  assert.equal(nonLues.json.meta.unread, 1);
  assert.equal(nonLues.json.meta.total, 1);
});

test("Journal : tout marquer comme lu ne touche que les siennes", async () => {
  const moi = await creerUtilisateur();
  const autre = await creerUtilisateur();
  await creerNotes(moi.id, 3);
  await creerNotes(autre.id, 2);

  const r = await http("PATCH", "/api/notifications/read-all", token(moi.id));
  assert.equal(r.status, 200);
  assert.equal(r.json.data.updated, 3);

  assert.equal((await http("GET", "/api/notifications", token(moi.id))).json.meta.unread, 0);
  assert.equal((await http("GET", "/api/notifications", token(autre.id))).json.meta.unread, 2);

  assert.equal((await http("PATCH", "/api/notifications/read-all", token(moi.id))).json.data.updated, 0);
});