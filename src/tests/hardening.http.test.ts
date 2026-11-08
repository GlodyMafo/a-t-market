import "./setup";
import "./setup.authLimitHigh";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { FakePawapay } from "./helpers/fakePawapay";
import {
  creerAdmin, creerCommande, creerProduit, creerUtilisateur,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";

const pawapay = new FakePawapay();
let server: Server;
let baseUrl = "";

before(async () => {
  await startTestDb();
  await pawapay.start();
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await pawapay.stop();
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  pawapay.reset();
});

const token = (userId: string, role: "USER" | "ADMIN" = "USER", alg: jwt.Algorithm = "HS256") =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: "1h", algorithm: alg });

async function http(method: string, path: string, opts?: { auth?: string; body?: unknown; raw?: string; headers?: Record<string, string> }) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(opts?.raw !== undefined || opts?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts?.auth ? { Authorization: opts.auth } : {}),
      ...opts?.headers,
    },
    body: opts?.raw ?? (opts?.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* pas du JSON */ }
  return { res, status: res.status, text, json };
}

// ---------- En-têtes, CORS, erreurs génériques ----------

test("En-têtes de sécurité : X-Powered-By absent, nosniff présent", async () => {
  const { res } = await http("GET", "/health");
  assert.equal(res.headers.get("x-powered-by"), null);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("CORS : domaine autorisé accepté, domaine inconnu sans autorisation, préflight géré", async () => {
  const ok = await http("GET", "/health", { headers: { Origin: "http://localhost:3000" } });
  assert.equal(ok.res.headers.get("access-control-allow-origin"), "http://localhost:3000");

  const ko = await http("GET", "/health", { headers: { Origin: "https://evil.example" } });
  assert.equal(ko.res.headers.get("access-control-allow-origin"), null);

  const pre = await http("OPTIONS", "/api/cart", {
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.res.headers.get("access-control-allow-origin"), "http://localhost:3000");
});

test("Route inconnue -> 404 JSON ; JSON invalide -> 400 propre, sans trace interne", async () => {
  const nf = await http("GET", "/api/nimporte-quoi");
  assert.equal(nf.status, 404);
  assert.equal(nf.json.success, false);

  const bad = await http("POST", "/auth/login", { raw: "{oops" });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.message, "Corps de requête JSON invalide");
  assert.doesNotMatch(bad.text, /SyntaxError|node_modules|\bat\s.+\(/);
});

// ---------- Authentification ----------

const inscription = (over: Record<string, unknown> = {}) =>
  http("POST", "/auth/register", {
    body: { email: "jean@test.cd", phone: "0990000001", password: "motdepasse1", ...over },
  });

test("Inscription : email normalisé, numéro nettoyé, doublon (même en majuscules) refusé", async () => {
  const r = await inscription({ email: "  Jean@Test.CD ", phone: "+243 81 234 5678" });
  assert.equal(r.status, 201);
  const u = await prisma.user.findUniqueOrThrow({ where: { email: "jean@test.cd" } });
  assert.equal(u.phone, "+243812345678");

  const dup = await inscription({ email: "JEAN@test.cd", phone: "0990000009" });
  assert.equal(dup.status, 400);
  assert.match(dup.json.message, /déjà utilisé/);
});

test("Inscription : numéro invalide, mot de passe trop long (en octets) -> 400 lisible", async () => {
  const tel = await inscription({ phone: "abc" });
  assert.equal(tel.status, 400);
  assert.equal(tel.json.message, "Numéro invalide");

  const long1 = await inscription({ password: "a".repeat(80) });
  assert.equal(long1.status, 400);
  assert.match(long1.json.message, /trop long/);

  const emojis = await inscription({ password: "😀".repeat(30) }); // 30 caractères, 120 octets
  assert.equal(emojis.status, 400);
  assert.equal(await prisma.user.count(), 0);
});

test("Connexion : insensible à la casse de l'email, message identique pour mauvais mot de passe et email inconnu", async () => {
  await inscription();

  const ok = await http("POST", "/auth/login", { body: { email: "JEAN@Test.cd", password: "motdepasse1" } });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.data.token);

  const mauvais = await http("POST", "/auth/login", { body: { email: "jean@test.cd", password: "mauvaispass" } });
  const inconnu = await http("POST", "/auth/login", { body: { email: "nobody@test.cd", password: "mauvaispass" } });
  assert.equal(mauvais.status, 400);
  assert.equal(inconnu.status, 400);
  assert.equal(mauvais.json.message, "Identifiants invalides");
  assert.equal(inconnu.json.message, "Identifiants invalides");
});

test("Jeton : « Bearer » obligatoire, algorithme HS256 uniquement", async () => {
  const user = await creerUtilisateur();
  const t = token(user.id);

  assert.equal((await http("GET", "/auth/me", { auth: t })).status, 401); // sans « Bearer »
  assert.equal((await http("GET", "/auth/me", { auth: `Bearer ${token(user.id, "USER", "HS512")}` })).status, 401);
  assert.equal((await http("GET", "/auth/me", { auth: `Bearer ${t}` })).status, 200);
});

// ---------- Panier : quantités et identifiants ----------

test("Panier : quantités et identifiants invalides -> 400 clair, rien d'écrit", async () => {
  const user = await creerUtilisateur();
  const auth = `Bearer ${token(user.id)}`;
  const p = await creerProduit({ stock: 5 });

  for (const quantity of [0, -1, 1.5, "2", 1000, null]) {
    const r = await http("POST", "/api/cart", { auth, body: { productId: p.id, quantity } });
    assert.equal(r.status, 400, `quantity=${JSON.stringify(quantity)}`);
    assert.doesNotMatch(r.text, /prisma|Invalid `/i);
  }
  for (const productId of [123, "", undefined, { $ne: 1 }]) {
    const r = await http("POST", "/api/cart", { auth, body: { productId, quantity: 1 } });
    assert.equal(r.status, 400);
  }
  assert.equal(await prisma.cartItem.count(), 0);

  const long = await http("PATCH", `/api/cart/item/${"x".repeat(65)}`, { auth, body: { quantity: 1 } });
  assert.equal(long.status, 400);
  const q0 = await http("PATCH", `/api/cart/item/abc`, { auth, body: { quantity: 0 } });
  assert.equal(q0.status, 400);
});

test("Panier : ajout valide (quantité 1 par défaut)", async () => {
  const user = await creerUtilisateur();
  const auth = `Bearer ${token(user.id)}`;
  const p = await creerProduit({ stock: 5 });

  const r = await http("POST", "/api/cart", { auth, body: { productId: p.id } });
  assert.equal(r.status, 201);
  assert.equal(r.json.data.quantity, 1);
});

test("Identifiant démesuré dans l'URL -> 400 (produit, commande, suivi)", async () => {
  const user = await creerUtilisateur();
  const auth = `Bearer ${token(user.id)}`;
  const long = "y".repeat(65);
  assert.equal((await http("GET", `/api/products/${long}`)).status, 400);
  assert.equal((await http("GET", `/api/orders/${long}`, { auth })).status, 400);
  assert.equal((await http("GET", `/api/tracking/order/${long}`, { auth })).status, 400);
});

// ---------- Fuites d'informations ----------

test("Paiement : une erreur brute de PawaPay n'atteint jamais le client", async () => {
  const { user, order } = await creerCommande();
  pawapay.postStatus = 500;
  pawapay.postResponse = { secret: "CLE-SECRETE-PAWAPAY", detail: "stack interne" };

  const r = await http("POST", "/api/payments", {
    auth: `Bearer ${token(user.id)}`,
    body: { orderId: order.id, paymentType: "FULL", phoneNumber: "0990000001", provider: "AIRTEL" },
  });

  assert.equal(r.status, 400);
  assert.match(r.json.message, /n'a pas pu être initié/);
  assert.doesNotMatch(r.text, /CLE-SECRETE|stack interne|PawaPay HTTP/);
});

// ---------- Pagination ----------

test("Mes commandes : pagination, bornes de limit, valeurs absurdes ramenées aux défauts", async () => {
  const user = await creerUtilisateur();
  const auth = `Bearer ${token(user.id)}`;
  for (let i = 0; i < 3; i++) {
    await prisma.order.create({
      data: { userId: user.id, productsAmount: "10", shippingAmount: "0", totalAmount: "10" },
    });
  }

  const p1 = await http("GET", "/api/orders/me?limit=2&page=1", { auth });
  assert.equal(p1.json.data.length, 2);
  assert.deepEqual(p1.json.meta, { page: 1, limit: 2, total: 3, totalPages: 2 });

  const p2 = await http("GET", "/api/orders/me?limit=2&page=2", { auth });
  assert.equal(p2.json.data.length, 1);
  const ids = new Set([...p1.json.data, ...p2.json.data].map((o: any) => o.id));
  assert.equal(ids.size, 3); // aucune commande répétée ni oubliée

  const grand = await http("GET", "/api/orders/me?limit=1000", { auth });
  assert.equal(grand.json.meta.limit, 100);

  const absurde = await http("GET", "/api/orders/me?page=-5&limit=abc", { auth });
  assert.equal(absurde.json.meta.page, 1);
  assert.equal(absurde.json.meta.limit, 20);
});

test("Admin : commandes, produits et stock sont paginés", async () => {
  const a = await creerAdmin();
  const auth = `Bearer ${token(a.id, "ADMIN")}`;
  await creerCommande();
  await creerCommande();
  await creerProduit();
  await creerProduit();

  const o = await http("GET", "/api/admin/orders?limit=1", { auth });
  assert.equal(o.json.data.length, 1);
  assert.equal(o.json.meta.total, 2);
  assert.equal(o.json.meta.totalPages, 2);

  const pr = await http("GET", "/api/admin/products?limit=1", { auth });
  assert.equal(pr.json.data.length, 1);
  assert.equal(pr.json.meta.total, 2);

  const inv = await http("GET", "/api/admin/inventory?limit=1&page=2", { auth });
  assert.equal(inv.json.data.length, 1);
  assert.equal(inv.json.meta.total, 2);
});