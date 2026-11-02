import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import {
  creerAdmin, creerCommande, creerProduit, creerReglages, creerSousCategorie, creerUtilisateur,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";

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
  return fetch(`${baseUrl}/api/admin${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function admin() {
  const a = await creerAdmin();
  return token(a.id, "ADMIN");
}

test("Nouvelles routes admin : sans jeton -> 401, jeton client -> 403", async () => {
  const user = await creerUtilisateur();
  const userToken = token(user.id, "USER");
  const routes: [string, string][] = [
    ["GET", "/dashboard"],
    ["GET", "/dashboard/to-purchase"],
    ["POST", "/orders/x/tracking"],
    ["DELETE", "/products/x"],
  ];
  for (const [method, path] of routes) {
    const body = method === "POST" ? {} : undefined;
    assert.equal((await call(method, path, null, body)).status, 401, `${method} ${path}`);
    assert.equal((await call(method, path, userToken, body)).status, 403, `${method} ${path}`);
  }
});

test("Tracking : corps invalides -> 400 et rien d'écrit", async () => {
  const t = await admin();
  const { order } = await creerCommande({ status: "PAID" });

  for (const body of [
    {},
    { status: "NIMPORTEQUOI" },
    { status: "ORDER_VALIDATED", extra: 1 },
    { status: "ORDER_VALIDATED", message: "x".repeat(501) },
  ]) {
    assert.equal((await call("POST", `/orders/${order.id}/tracking`, t, body)).status, 400);
  }
  assert.equal(await prisma.trackingEvent.count(), 0);
});

test("Tracking sur commande non payée -> 409 ORDER_NOT_PAID ; commande inconnue -> 404", async () => {
  const t = await admin();
  const { order } = await creerCommande(); // PENDING_PAYMENT

  const r = await call("POST", `/orders/${order.id}/tracking`, t, { status: "DELIVERED" });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).code, "ORDER_NOT_PAID");

  const r2 = await call("POST", `/orders/inconnue/tracking`, t, { status: "ORDER_VALIDATED" });
  assert.equal(r2.status, 404);
});

test("PATCH produit : liste blanche des champs, rien d'autre ne passe", async () => {
  const t = await admin();
  const p = await creerProduit({ price: "10.00", name: "Chaise" });

  for (const body of [{ type: "INTERNATIONAL" }, { isActive: false }, { slug: "x" }, { price: -1 }, {}]) {
    assert.equal((await call("PATCH", `/products/${p.id}`, t, body)).status, 400);
  }
  const intact = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(intact.type, "LOCAL");
  assert.equal(intact.isActive, true);
  assert.equal(intact.price.toString(), "10");

  const ok = await call("PATCH", `/products/${p.id}`, t, { price: 12.5 });
  assert.equal(ok.status, 200);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).price.toString(), "12.5");
});

test("POST produit : validation, puis création avec un stock à 0", async () => {
  const t = await admin();
  const sub = await creerSousCategorie();
  const base = { name: "Table", price: 20, margin: 5, images: ["/uploads/a.jpg"], subCategoryId: sub.id };

  for (const body of [
    { ...base, price: 0 },
    { ...base, name: "" },
    { ...base, images: ["a", "b", "c", "d"] },
    { ...base, type: "INTERNATIONAL" },
  ]) {
    assert.equal((await call("POST", "/products", t, body)).status, 400);
  }

  const ok = await call("POST", "/products", t, base);
  assert.equal(ok.status, 201);
  const created = (await ok.json()).data;
  assert.equal(created.inventory.quantity, 0);
});

test("Stock : quantités invalides -> 400, valides -> 200", async () => {
  const t = await admin();
  const p = await creerProduit({ stock: 5 });

  for (const q of [-1, 1.5, "5", null]) {
    assert.equal((await call("PATCH", `/inventory/${p.id}`, t, { quantity: q })).status, 400);
  }
  assert.equal((await call("POST", `/inventory/restock/${p.id}`, t, { quantity: 0 })).status, 400);

  assert.equal((await call("PATCH", `/inventory/${p.id}`, t, { quantity: 7 })).status, 200);
  assert.equal((await call("POST", `/inventory/restock/${p.id}`, t, { quantity: 3, reason: "Livraison" })).status, 200);
  assert.equal((await prisma.inventory.findUniqueOrThrow({ where: { productId: p.id } })).quantity, 10);
});

test("DELETE produit : jamais commandé -> supprimé", async () => {
  const t = await admin();
  const p = await creerProduit();

  const r = await call("DELETE", `/products/${p.id}`, t);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data.deleted, true);
  assert.equal(await prisma.product.count({ where: { id: p.id } }), 0);
});

test("Réglages : lecture admin et configuration du taux CNY/USD", async () => {
  const t = await admin();
  await creerReglages();

  const getResponse = await call("GET", "/settings", t);
  assert.equal(getResponse.status, 200);

  const getBody = await getResponse.json() as any;
  assert.equal(getBody.success, true);
  assert.equal(getBody.data.cnyToUsdRate, null);

  const patchResponse = await call("PATCH", "/settings", t, {
    cnyToUsdRate: 0.14,
  });

  assert.equal(patchResponse.status, 200);

  const patchBody = await patchResponse.json() as any;
  assert.equal(patchBody.success, true);
  assert.equal(Number(patchBody.data.cnyToUsdRate), 0.14);

  const saved = await prisma.globalSettings.findFirstOrThrow();
  assert.equal(Number(saved.cnyToUsdRate), 0.14);
});

test("Réglages : taux CNY/USD invalide refusé sans modifier la configuration", async () => {
  const t = await admin();
  await creerReglages({ cnyToUsdRate: "0.14" });

  for (const value of [0, -0.1, 10.01, "0.14", null]) {
    const response = await call("PATCH", "/settings", t, {
      cnyToUsdRate: value,
    });

    assert.equal(response.status, 400, `Valeur refusée attendue : ${String(value)}`);
  }

  const saved = await prisma.globalSettings.findFirstOrThrow();
  assert.equal(Number(saved.cnyToUsdRate), 0.14);
});

test("Réglages : accès refusé sans authentification ou avec un compte client", async () => {
  const user = await creerUtilisateur();
  const userToken = token(user.id, "USER");

  assert.equal((await call("GET", "/settings", null)).status, 401);
  assert.equal((await call("PATCH", "/settings", null, {
    cnyToUsdRate: 0.14,
  })).status, 401);

  assert.equal((await call("GET", "/settings", userToken)).status, 403);
  assert.equal((await call("PATCH", "/settings", userToken, {
    cnyToUsdRate: 0.14,
  })).status, 403);
});