import "./setup";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import app from "../app";

let server: Server;
let baseUrl = "";

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

function tokenPour(role: "USER" | "ADMIN") {
  return jwt.sign({ userId: "u1", role }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });
}

test("GET /health répond 200", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "ok");
});

test("POST /api/payments/confirm/:id n'existe plus (404)", async () => {
  const res = await fetch(`${baseUrl}/api/payments/confirm/abc`, {
    method: "POST",
  });
  assert.equal(res.status, 404);
});

for (const [methode, chemin] of [
  ["POST", "/api/payments"],
  ["GET", "/api/cart/me"],
  ["POST", "/api/orders"],
  ["GET", "/api/orders/me"],
  ["GET", "/api/tracking/order/abc"],
  ["GET", "/api/admin/orders"],
  ["GET", "/api/admin/quotes/pending"],
  ["POST", "/api/international-quotes"],
] as const) {
  test(`${methode} ${chemin} sans jeton -> 401`, async () => {
    const res = await fetch(`${baseUrl}${chemin}`, { method: methode });
    assert.equal(res.status, 401);
  });
}

test("Un jeton USER sur une route admin -> 403", async () => {
  const res = await fetch(`${baseUrl}/api/admin/orders`, {
    headers: { Authorization: `Bearer ${tokenPour("USER")}` },
  });
  assert.equal(res.status, 403);
});

test("Un jeton USER sur les devis admin -> 403", async () => {
  const res = await fetch(`${baseUrl}/api/admin/quotes/pending`, {
    headers: { Authorization: `Bearer ${tokenPour("USER")}` },
  });
  assert.equal(res.status, 403);
});

test("Un jeton signé avec un mauvais secret -> 401", async () => {
  const faux = jwt.sign({ userId: "u1", role: "ADMIN" }, "mauvais-secret");
  const res = await fetch(`${baseUrl}/api/admin/orders`, {
    headers: { Authorization: `Bearer ${faux}` },
  });
  assert.equal(res.status, 401);
});