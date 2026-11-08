import "./setup";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import app from "../app";
import { startTestDb, stopTestDb } from "./helpers/testDb";

let server: Server;
let baseUrl = "";

before(async () => {
  await startTestDb();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await stopTestDb();
});

test("GET /health/ready : base joignable -> 200", async () => {
  const res = await fetch(`${baseUrl}/health/ready`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.database, "ok");
});

test("GET /health/ready : sans jeton, la route est publique et ne divulgue rien", async () => {
  const res = await fetch(`${baseUrl}/health/ready`);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ["database", "status"]);
});