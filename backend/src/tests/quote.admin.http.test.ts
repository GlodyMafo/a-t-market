import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import {
  creerAdmin,
  creerReglages,
  creerSousCategorie,
  creerUtilisateur,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";
import { createInternationalQuote } from "../services/internationalQuote.service";

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
  server.close();
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
});

const token = (userId: string, role: "USER" | "ADMIN") =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: "1h" });

function call(method: string, path: string, auth: string | null, body?: unknown) {
  return fetch(`${baseUrl}/api/admin/quotes${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function scenario() {
  await creerReglages();
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const sub = await creerSousCategorie();
  const quote = await createInternationalQuote(
    user.id,
    "https://www.shein.com/x-p-1.html",
    "Robe",
    20,
    sub.id
  );
  return { user, admin, quote, adminToken: token(admin.id, "ADMIN"), userToken: token(user.id, "USER") };
}

// =============== Accès ===============

test("Les 4 routes admin des devis : sans jeton -> 401, jeton client -> 403", async () => {
  const { user, quote, userToken } = await scenario();
  const routes: [string, string][] = [
    ["GET", "/pending"],
    ["GET", `/${quote.id}/history`],
    ["POST", `/approve/${quote.id}`],
    ["POST", `/reject/${quote.id}`],
  ];

  for (const [method, path] of routes) {
    const body = method === "GET" ? undefined : {};
    assert.equal((await call(method, path, null, body)).status, 401, `${method} ${path}`);
    assert.equal((await call(method, path, userToken, body)).status, 403, `${method} ${path}`);
  }
  assert.ok(user.id);
});

// =============== Validation ===============

test("Approbation : corps invalides -> 400, devis inchangé", async () => {
  const { quote, adminToken } = await scenario();

  const invalides: unknown[] = [
    { weightKg: 0 },
    { weightKg: -2 },
    { weightKg: "2" },
    { weightKg: 1.234 },
    { weightKg: 5000 },
    { adminNotes: "" },
    { adminNotes: 12 },
    { weightKg: 1, status: "APPROVED" },
    { totalPrice: 1 },
  ];

  for (const body of invalides) {
    const res = await call("POST", `/approve/${quote.id}`, adminToken, body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(q.status, "PENDING_REVIEW");
});

test("Rejet : sans motif, motif trop court, champ inconnu -> 400", async () => {
  const { quote, adminToken } = await scenario();

  for (const body of [{}, { adminNotes: "" }, { adminNotes: "ab" }, { adminNotes: "motif ok", status: "X" }]) {
    const res = await call("POST", `/reject/${quote.id}`, adminToken, body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test("Devis inconnu -> 404 (approbation, rejet, historique)", async () => {
  const { adminToken } = await scenario();

  assert.equal((await call("POST", "/approve/inexistant", adminToken, { weightKg: 1 })).status, 404);
  assert.equal((await call("POST", "/reject/inexistant", adminToken, { adminNotes: "motif ok" })).status, 404);
  assert.equal((await call("GET", "/inexistant/history", adminToken)).status, 404);
});

// =============== Parcours complet ===============

test("Parcours admin complet : lister, approuver avec poids, consulter l'historique", async () => {
  const { quote, adminToken, admin } = await scenario();

  const pending = await (await call("GET", "/pending", adminToken)).json();
  assert.equal(pending.data.length, 1);
  assert.equal("password" in pending.data[0].user, false);

  const approve = await call("POST", `/approve/${quote.id}`, adminToken, {
    weightKg: 0.5,
    adminNotes: "Pesé en entrepôt",
  });
  assert.equal(approve.status, 200);
  const approved = (await approve.json()).data;
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.totalPrice, "38");
  assert.equal(approved.weightSource, "ADMIN");

  assert.equal((await (await call("GET", "/pending", adminToken)).json()).data.length, 0);

  const history = (await (await call("GET", `/${quote.id}/history`, adminToken)).json()).data;
  assert.equal(history.length, 1);
  assert.equal(history[0].admin.id, admin.id);
  assert.equal(history[0].snapshotBefore.totalPrice, "31");
  assert.equal(history[0].snapshotAfter.totalPrice, "38");
  assert.equal(JSON.stringify(history).includes("password"), false);
});

test("Après approbation : nouvelle approbation -> 400, rejet -> 400, montant conservé", async () => {
  const { quote, adminToken } = await scenario();
  await call("POST", `/approve/${quote.id}`, adminToken, { weightKg: 0.5 });

  assert.equal((await call("POST", `/approve/${quote.id}`, adminToken, { weightKg: 9 })).status, 400);
  assert.equal(
    (await call("POST", `/reject/${quote.id}`, adminToken, { adminNotes: "Trop tard" })).status,
    400
  );
  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(q.totalPrice.toString(), "38");
});

test("Rejet par HTTP : 200, statut REJECTED, motif visible", async () => {
  const { quote, adminToken } = await scenario();

  const res = await call("POST", `/reject/${quote.id}`, adminToken, { adminNotes: "Article interdit" });

  assert.equal(res.status, 200);
  const data = (await res.json()).data;
  assert.equal(data.status, "REJECTED");
  assert.equal(data.adminNotes, "Article interdit");
});