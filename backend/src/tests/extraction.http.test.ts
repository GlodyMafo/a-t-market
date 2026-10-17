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

const token = (userId: string) =>
  jwt.sign({ userId, role: "USER" }, process.env.JWT_SECRET!, { expiresIn: "1h" });

const post = (path: string, userId: string | null, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}),
    },
    body: JSON.stringify(body),
  });

test("/api/external-products/extract sans jeton -> 401 (plus public)", async () => {
  // URL non prise en charge : en cas de régression, le test échoue vite au lieu d'appeler Apify.
  const res = await post("/api/external-products/extract", null, { url: "https://www.amazon.com/x" });
  assert.equal(res.status, 401);
});

test("extract avec jeton mais sans URL -> 400", async () => {
  const res = await post("/api/external-products/extract", "u-a", {});
  assert.equal(res.status, 400);
});

test("extract : domaine non pris en charge refusé AVANT tout appel au fournisseur", async () => {
  for (const url of [
    "https://shein.com.evil.com/x",
    "https://www.amazon.com/dp/1",
    "http://169.254.169.254/latest/meta-data/",
  ]) {
    const res = await post("/api/external-products/extract", "u-b", { url });
    assert.equal(res.status, 400, url);
    const json = await res.json();
    assert.match(json.message, /pas encore pris en charge|invalide/, url);
  }
});

test("Création de devis : URL piégée refusée avec un jeton valide", async () => {
  const res = await post("/api/international-quotes", "u-c", {
    productUrl: "https://shein.com@evil.com/x",
    subCategoryId: "peu-importe",
  });
  assert.equal(res.status, 400);
});

test("Limite de fréquence : la 11e demande d'un même utilisateur en 10 min -> 429", async () => {
  const statuts: number[] = [];
  for (let i = 0; i < 11; i++) {
    const res = await post("/api/external-products/extract", "u-limite", {});
    statuts.push(res.status);
  }
  assert.deepEqual(statuts.slice(0, 10), Array(10).fill(400));
  assert.equal(statuts[10], 429);
});

test("La limite est PAR utilisateur : un autre utilisateur n'est pas bloqué", async () => {
  for (let i = 0; i < 11; i++) {
    await post("/api/external-products/extract", "u-gros-consommateur", {});
  }
  const autre = await post("/api/external-products/extract", "u-autre", {});
  assert.equal(autre.status, 400); // pas 429
});

test("La limite est partagée entre extraction et création de devis", async () => {
  for (let i = 0; i < 10; i++) {
    await post("/api/international-quotes", "u-partage", {});
  }
  const res = await post("/api/external-products/extract", "u-partage", {});
  assert.equal(res.status, 429);
});