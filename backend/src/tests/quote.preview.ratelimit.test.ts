import "./setup";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import app from "../app";

let server: Server;
let baseUrl = "";

before(async () => {
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
});

const preview = () =>
  fetch(`${baseUrl}/api/international-quotes/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}), // corps invalide : 400, sans base ni extraction
  });

test("Limite par IP : 5 aperçus par fenêtre, le 6e est refusé (429), même pour des demandes invalides", async () => {
  const statuts: number[] = [];
  for (let i = 0; i < 6; i++) {
    statuts.push((await preview()).status);
  }

  assert.deepEqual(statuts, [400, 400, 400, 400, 400, 429]);
});

test("Le refus 429 renvoie un message clair et les en-têtes de limite", async () => {
  const res = await preview();

  assert.equal(res.status, 429);
  assert.match((await res.json()).message, /Trop d'aperçus/);
  assert.ok(res.headers.get("ratelimit") || res.headers.get("ratelimit-limit") || res.headers.get("retry-after"));
});