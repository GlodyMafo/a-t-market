import "./setup";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { startTestDb, stopTestDb } from "./helpers/testDb";
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

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

let n = 0;
const inscrire = () => {
  n++;
  return post("/auth/register", {
    email: `user${n}@test.cd`,
    phone: `0990${String(n).padStart(6, "0")}`,
    password: "motdepasse1",
  });
};

test("Connexion : les succès ne comptent pas, 10 échecs bloquent le 11e (429)", async () => {
  assert.equal((await inscrire()).status, 201); // 1 inscription sur 5

  for (let i = 0; i < 12; i++) {
    const ok = await post("/auth/login", { email: "user1@test.cd", password: "motdepasse1" });
    assert.equal(ok.status, 200, `succès n°${i + 1}`);
  }

  const statuts: number[] = [];
  for (let i = 0; i < 11; i++) {
    statuts.push((await post("/auth/login", { email: "user1@test.cd", password: "mauvaispass" })).status);
  }
  assert.deepEqual(statuts, [400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 429]);

  // Même avec le bon mot de passe, la fenêtre bloquée reste bloquée.
  const bloque = await post("/auth/login", { email: "user1@test.cd", password: "motdepasse1" });
  assert.equal(bloque.status, 429);
  assert.match((await bloque.json()).message, /Trop de tentatives/);
});

test("Inscription : 5 par heure et par IP, la 6e est refusée (429)", async () => {
  const statuts: number[] = [];
  for (let i = 0; i < 5; i++) statuts.push((await inscrire()).status); // 4 restantes + 1 refusée
  assert.deepEqual(statuts, [201, 201, 201, 201, 429]);
});