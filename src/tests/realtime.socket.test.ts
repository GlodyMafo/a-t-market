import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerAdmin, creerCommande, creerPaiement, creerProduit, creerUtilisateur } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";
import { initRealtime } from "../realtime/socket";
import { setRealtimeEmitter } from "../realtime/emitter";
import { settlePaymentByDepositId } from "../services/payment.settlement.service";
import { postTrackingEvent } from "../services/orderTracking.service";

let server: Server;
let io: ReturnType<typeof initRealtime>;
let url = "";
const ouverts: Socket[] = [];

before(async () => {
  await startTestDb();
  server = http.createServer(app);
  io = initRealtime(server);
  await new Promise<void>((r) => server.listen(0, () => r()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  ouverts.forEach((s) => s.close());
  await io.close();
  setRealtimeEmitter(null);
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  ouverts.splice(0).forEach((s) => s.close());
  await resetTestDb();
});

const token = (userId: string) =>
  jwt.sign({ userId, role: "USER" }, process.env.JWT_SECRET!, { expiresIn: "1h" });

function connecter(auth?: Record<string, unknown>) {
  const s = ioClient(url, { auth, reconnection: false, transports: ["websocket"] });
  ouverts.push(s);
  return s;
}

const connecte = (s: Socket) =>
  new Promise<void>((resolve, reject) => {
    s.once("connect", () => resolve());
    s.once("connect_error", (e) => reject(e));
  });

const prochainMessage = (s: Socket, delaiMs = 3000) =>
  new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("aucun message reçu")), delaiMs);
    s.once("notification", (m) => {
      clearTimeout(t);
      resolve(m);
    });
  });

const silence = (s: Socket, delaiMs = 400) =>
  new Promise<void>((resolve, reject) => {
    s.once("notification", () => reject(new Error("message inattendu")));
    setTimeout(resolve, delaiMs);
  });

const trouve = (depositId: string, data: { status: string; amount?: string; currency?: string }) =>
  async () => ({ status: "FOUND", data: { depositId, ...data } });

test("Connexion refusée sans jeton ou avec un jeton invalide", async () => {
  for (const auth of [undefined, {}, { token: "" }, { token: "n-importe-quoi" }, { token: 123 }]) {
    await assert.rejects(connecte(connecter(auth as any)), /UNAUTHORIZED/);
  }
});

test("Connexion acceptée avec un jeton valide (avec ou sans le préfixe Bearer)", async () => {
  const user = await creerUtilisateur();
  await connecte(connecter({ token: token(user.id) }));
  await connecte(connecter({ token: `Bearer ${token(user.id)}` }));
});

test("Paiement confirmé : le client connecté reçoit la notification en direct, les autres rien", async () => {
  const { user, order } = await creerCommande({ total: "34.00" });
  const intrus = await creerUtilisateur();
  const moi = connecter({ token: token(user.id) });
  const autre = connecter({ token: token(intrus.id) });
  await Promise.all([connecte(moi), connecte(autre)]);

  const recu = prochainMessage(moi);
  const rien = silence(autre);

  const { depositId } = await creerPaiement(order.id, "34.00");
  await settlePaymentByDepositId(depositId, trouve(depositId, { status: "COMPLETED", amount: "34.00", currency: "USD" }));

  const m = await recu;
  assert.equal(m.type, "PAYMENT_CONFIRMED");
  assert.equal(m.orderId, order.id);
  assert.equal(m.readAt, null);
  await rien;
});

test("Plusieurs onglets du même client reçoivent tous la notification", async () => {
  const { user, order } = await creerCommande({ status: "PAID" });
  const p = await creerProduit();
  await prisma.orderItem.create({
    data: { orderId: order.id, productId: p.id, quantity: 1, basePrice: "10", margin: "0", price: "10" },
  });
  const admin = await creerAdmin();

  const a = connecter({ token: token(user.id) });
  const b = connecter({ token: token(user.id) });
  await Promise.all([connecte(a), connecte(b)]);

  const [ra, rb] = [prochainMessage(a), prochainMessage(b)];
  await postTrackingEvent({ orderId: order.id, status: "ORDER_VALIDATED", actorId: admin.id });

  const [ma, mb] = await Promise.all([ra, rb]);
  assert.equal(ma.type, "ORDER_STATUS_CHANGED");
  assert.equal(ma.title, "Commande validée");
  assert.equal(mb.id, ma.id);
});

test("Le serveur ignore ce que le client lui envoie", async () => {
  const user = await creerUtilisateur();
  const s = connecter({ token: token(user.id) });
  await connecte(s);
  s.emit("notification", { forge: true });
  s.emit("join", "user:quelquun-d-autre");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(s.connected, true);
});