import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerAdmin, creerProduit, creerUtilisateur } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import app from "../app";
import { getProducts, searchProducts } from "../services/product.service";
import { addToCart, getCartByUser } from "../services/cart.service";
import { createOrderFromCart } from "../services/order.service";

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

const token = (userId: string, role: "USER" | "ADMIN" = "USER") =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: "1h" });

async function http(method: string, path: string, opts?: { auth?: string; body?: unknown }) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(opts?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts?.auth ? { Authorization: `Bearer ${opts.auth}` } : {}),
    },
    body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* pas du JSON */ }
  return { status: res.status, json, text };
}

const liste = (qs = "") => http("GET", `/api/products${qs}`);
const noms = (r: { json: any }) => r.json.data.map((p: any) => p.name);

let n = 0;
async function creerCat(name: string, active = true) {
  n++;
  return prisma.category.create({ data: { name, slug: `cat-${n}-${Date.now()}`, isActive: active } });
}
async function creerSous(name: string, categoryId: string, active = true) {
  n++;
  return prisma.subCategory.create({
    data: { name, slug: `sous-${n}-${Date.now()}`, categoryId, isActive: active },
  });
}
async function produit(
  name: string,
  o: { price?: string; margin?: string; stock?: number; sub?: string; createdAt?: string } = {}
) {
  const p = await creerProduit({ name, price: o.price, margin: o.margin, stock: o.stock });
  if (o.sub || o.createdAt) {
    await prisma.product.update({
      where: { id: p.id },
      data: {
        ...(o.sub ? { subCategoryId: o.sub } : {}),
        ...(o.createdAt ? { createdAt: new Date(o.createdAt) } : {}),
      },
    });
  }
  return p;
}

// ====================== Recherche ======================

test("Recherche : insensible aux accents et à la casse, tous les mots doivent correspondre", async () => {
  await produit("Téléphone Samsung");
  await produit("Chaussure Nike");
  await produit("Sac à dos");

  assert.deepEqual(noms(await liste("?q=telephone")), ["Téléphone Samsung"]);
  assert.deepEqual(noms(await liste("?q=TÉLÉPHONE")), ["Téléphone Samsung"]);
  assert.deepEqual(noms(await liste("?q=samsung%20telephone")), ["Téléphone Samsung"]);
  assert.deepEqual(noms(await liste("?q=sac%20a%20dos")), ["Sac à dos"]);

  const aucun = await liste("?q=introuvable");
  assert.equal(aucun.status, 200);
  assert.deepEqual(aucun.json.data, []);
  assert.equal(aucun.json.meta.total, 0);
});

test("Recherche : trouve aussi par catégorie ; le nom passe avant la catégorie (pertinence)", async () => {
  const cat = await creerCat("Mode");
  const sous = await creerSous("Chaussures", cat.id);
  await produit("Chaussures de sport", { createdAt: "2026-01-01" });
  await produit("Nike Air", { sub: sous.id, createdAt: "2026-06-01" }); // plus récent, mais seulement via la catégorie

  assert.deepEqual(noms(await liste("?q=chaussures")), ["Chaussures de sport", "Nike Air"]);
  assert.deepEqual(noms(await liste("?q=mode%20nike")), ["Nike Air"]);
});

// ====================== Filtres ======================

test("Filtres : par catégorie et par sous-catégorie", async () => {
  const a = await creerCat("Maison");
  const b = await creerCat("Mode");
  const a1 = await creerSous("Cuisine", a.id);
  const a2 = await creerSous("Salon", a.id);
  const b1 = await creerSous("Hommes", b.id);
  await produit("Casserole", { sub: a1.id });
  await produit("Canapé", { sub: a2.id });
  await produit("Chemise", { sub: b1.id });

  assert.deepEqual((noms(await liste(`?categoryId=${a.id}`))).sort(), ["Canapé", "Casserole"]);
  assert.deepEqual(noms(await liste(`?subCategoryId=${a2.id}`)), ["Canapé"]);
  assert.deepEqual(noms(await liste(`?categoryId=${b.id}&subCategoryId=${a1.id}`)), []);
});

test("Filtres : le prix est le prix TOTAL final (prix + marge), calculé sans erreur d'arrondi", async () => {
  await produit("A", { price: "10.00", margin: "5.00" }); // 15
  await produit("B", { price: "12.00", margin: "0" }); // 12
  await produit("C", { price: "20.00", margin: "0" }); // 20
  await produit("D", { price: "0.10", margin: "0.20" }); // 0,30

  assert.deepEqual((noms(await liste("?minPrice=14"))).sort(), ["A", "C"]);
  assert.deepEqual((noms(await liste("?maxPrice=15"))).sort(), ["A", "B", "D"]);
  assert.deepEqual(noms(await liste("?minPrice=13&maxPrice=16")), ["A"]);
  assert.deepEqual(noms(await liste("?minPrice=0.3&maxPrice=0.3")), ["D"]);
});

// ====================== Tris ======================

test("Tris : prix croissant/décroissant sur le prix final, nom sans accents, plus récent par défaut", async () => {
  await produit("X", { price: "5", margin: "10", createdAt: "2026-01-01" }); // 15
  await produit("Y", { price: "12", margin: "0", createdAt: "2026-02-01" }); // 12
  await produit("Z", { price: "8", margin: "8", createdAt: "2026-03-01" }); // 16

  assert.deepEqual(noms(await liste("?sort=price_asc")), ["Y", "X", "Z"]);
  assert.deepEqual(noms(await liste("?sort=price_desc")), ["Z", "X", "Y"]);
  assert.deepEqual(noms(await liste()), ["Z", "Y", "X"]); // plus récent d'abord
  assert.deepEqual(noms(await liste("?sort=newest")), ["Z", "Y", "X"]);

  await resetTestDb();
  await produit("Zèbre");
  await produit("Éléphant");
  await produit("Abeille");
  assert.deepEqual(noms(await liste("?sort=name_asc")), ["Abeille", "Éléphant", "Zèbre"]);
});

// ====================== Pagination ======================

test("Pagination : pages complètes, sans doublon, total exact", async () => {
  for (let i = 1; i <= 5; i++) await produit(`P${i}`, { createdAt: `2026-01-0${i}` });

  const p1 = await liste("?limit=2&page=1");
  const p2 = await liste("?limit=2&page=2");
  const p3 = await liste("?limit=2&page=3");
  const p4 = await liste("?limit=2&page=4");

  assert.deepEqual(p1.json.meta, { page: 1, limit: 2, total: 5, totalPages: 3 });
  assert.deepEqual([p1, p2, p3].map((r) => r.json.data.length), [2, 2, 1]);
  assert.deepEqual(p4.json.data, []);
  const tous = [...p1.json.data, ...p2.json.data, ...p3.json.data].map((p: any) => p.name);
  assert.deepEqual(tous, ["P5", "P4", "P3", "P2", "P1"]);
});

// ====================== Visibilité et prix public ======================

test("Visibilité : rupture, produit inactif, catégorie ou sous-catégorie désactivée sont masqués", async () => {
  const cat = await creerCat("Jouets");
  const sous = await creerSous("Peluches", cat.id);
  await produit("Visible", { sub: sous.id });
  await produit("Sans catégorie");
  await produit("En rupture", { stock: 0, sub: sous.id });
  const inactif = await produit("Inactif", { sub: sous.id });
  await prisma.product.update({ where: { id: inactif.id }, data: { isActive: false } });

  assert.deepEqual((noms(await liste())).sort(), ["Sans catégorie", "Visible"]);
  assert.equal((await liste()).json.meta.total, 2);

  await prisma.subCategory.update({ where: { id: sous.id }, data: { isActive: false } });
  assert.deepEqual(noms(await liste()), ["Sans catégorie"]);

  await prisma.subCategory.update({ where: { id: sous.id }, data: { isActive: true } });
  await prisma.category.update({ where: { id: cat.id }, data: { isActive: false } });
  assert.deepEqual(noms(await liste()), ["Sans catégorie"]);

  await prisma.category.update({ where: { id: cat.id }, data: { isActive: true } });
  assert.deepEqual((noms(await liste())).sort(), ["Sans catégorie", "Visible"]);
});

test("Cohérence : la recherche sans filtre voit exactement les mêmes produits que le catalogue complet", async () => {
  const cat = await creerCat("Divers");
  const sous = await creerSous("Autres", cat.id, false);
  await produit("A");
  await produit("B", { stock: 0 });
  await produit("C", { sub: sous.id });
  await produit("D");

  const r = await searchProducts({}, { skip: 0, take: 100 });
  const tous = await getProducts();
  assert.equal(r.total, tous.length);
  assert.deepEqual(r.items.map((p) => p.id).sort(), tous.map((p) => p.id).sort());
});

test("Prix public : le prix affiché est le total final et la marge n'est jamais exposée", async () => {
  const p = await produit("Lampe", { price: "10.00", margin: "5.00" });

  const l = await liste();
  assert.equal(Number(l.json.data[0].price), 15);
  assert.equal("margin" in l.json.data[0], false);
  assert.doesNotMatch(l.text, /"margin"/);

  const d = await http("GET", `/api/products/${p.id}`);
  assert.equal(d.status, 200);
  assert.equal(Number(d.json.data.price), 15);
  assert.equal("margin" in d.json.data, false);
});

test("Détail : produit d'une catégorie désactivée ou inconnu -> 404", async () => {
  const cat = await creerCat("Cachée");
  const sous = await creerSous("Sous cachée", cat.id);
  const p = await produit("Secret", { sub: sous.id });
  assert.equal((await http("GET", `/api/products/${p.id}`)).status, 200);

  await prisma.category.update({ where: { id: cat.id }, data: { isActive: false } });
  assert.equal((await http("GET", `/api/products/${p.id}`)).status, 404);

  const inconnu = await http("GET", "/api/products/inconnu");
  assert.equal(inconnu.status, 404);
  assert.equal(inconnu.json.message, "Produit introuvable");
});

// ====================== Validation de la requête ======================

test("Requête invalide -> 400 clair ; champs vides ignorés", async () => {
  await produit("A");

  for (const qs of ["?minPrice=20&maxPrice=10", "?sort=nimporte", `?q=${"x".repeat(101)}`, "?minPrice=abc", "?minPrice=-1"]) {
    const r = await liste(qs);
    assert.equal(r.status, 400, qs);
    assert.equal(r.json.success, false);
  }

  const vide = await liste("?q=&minPrice=&maxPrice=&sort=&categoryId=");
  assert.equal(vide.status, 200);
  assert.equal(vide.json.data.length, 1);
});

// ====================== Achat bloqué dans une catégorie désactivée ======================

test("Catégorie désactivée : ajout, panier et commande bloqués ; réactivée : tout revient", async () => {
  const user = await creerUtilisateur();
  const cat = await creerCat("Alcools");
  const sous = await creerSous("Bières", cat.id);
  const p1 = await produit("Bière A", { sub: sous.id });
  const p2 = await produit("Bière B", { sub: sous.id });

  await addToCart({ userId: user.id, productId: p1.id, quantity: 1 });
  assert.equal((await getCartByUser(user.id)).checkoutReady, true);

  await prisma.category.update({ where: { id: cat.id }, data: { isActive: false } });

  await assert.rejects(
    addToCart({ userId: user.id, productId: p2.id, quantity: 1 }),
    /n'est plus disponible/
  );
  const cart = await getCartByUser(user.id);
  assert.equal(cart.checkoutReady, false);
  assert.equal(cart.items[0].issue, "UNAVAILABLE");
  await assert.rejects(createOrderFromCart(user.id), /n'est plus disponible/);
  assert.equal(await prisma.order.count(), 0);

  await prisma.category.update({ where: { id: cat.id }, data: { isActive: true } });
  assert.equal((await getCartByUser(user.id)).checkoutReady, true);
  const order = await createOrderFromCart(user.id);
  assert.ok(order.id);
});

// ====================== Administration des catégories ======================

async function admin() {
  const a = await creerAdmin();
  return token(a.id, "ADMIN");
}

test("Catégories : accès réservé à l'admin", async () => {
  const user = await creerUtilisateur();
  const cat = await creerCat("Test");
  const routes: [string, string, unknown][] = [
    ["PATCH", `/api/categories/${cat.id}`, { name: "Autre" }],
    ["PATCH", `/api/categories/${cat.id}/active`, { isActive: false }],
    ["PATCH", `/api/subcategories/xyz`, { name: "Autre" }],
    ["PATCH", `/api/subcategories/xyz/active`, { isActive: false }],
    ["GET", `/api/admin/categories`, undefined],
  ];
  for (const [m, path, body] of routes) {
    assert.equal((await http(m, path, { body })).status, 401, `${m} ${path}`);
    assert.equal((await http(m, path, { auth: token(user.id), body })).status, 403, `${m} ${path}`);
  }
});

test("Catégories : création validée, modification (nom, slug, description), doublon refusé", async () => {
  const t = await admin();

  for (const body of [{}, { name: "" }, { name: "!!!" }, { name: "Ok", extra: 1 }]) {
    assert.equal((await http("POST", "/api/categories", { auth: t, body })).status, 400, JSON.stringify(body));
  }

  const a = (await http("POST", "/api/categories", { auth: t, body: { name: "Électroménager" } })).json.data;
  const b = (await http("POST", "/api/categories", { auth: t, body: { name: "Mode" } })).json.data;

  const maj = await http("PATCH", `/api/categories/${a.id}`, {
    auth: t,
    body: { name: "Maison & jardin", description: "Tout pour la maison" },
  });
  assert.equal(maj.status, 200);
  assert.equal(maj.json.data.name, "Maison & jardin");
  assert.equal(maj.json.data.slug, "maison-and-jardin");

  const doublon = await http("PATCH", `/api/categories/${b.id}`, { auth: t, body: { name: "Maison & jardin" } });
  assert.equal(doublon.status, 409);

  assert.equal((await http("PATCH", `/api/categories/${a.id}`, { auth: t, body: {} })).status, 400);
  assert.equal((await http("PATCH", `/api/categories/${a.id}`, { auth: t, body: { slug: "x" } })).status, 400);
  assert.equal((await http("PATCH", `/api/categories/inconnue`, { auth: t, body: { name: "Zed" } })).status, 404);

  const efface = await http("PATCH", `/api/categories/${a.id}`, { auth: t, body: { description: null } });
  assert.equal(efface.json.data.description, null);
});

test("Catégories : désactivation visible côté public, tout reste visible côté admin, réversible", async () => {
  const t = await admin();
  const a = await creerCat("Active");
  const b = await creerCat("À cacher");
  const sb = await creerSous("Sous B", b.id);
  await produit("Produit B", { sub: sb.id });

  assert.equal((await http("GET", "/api/categories")).json.data.length, 2);

  const off = await http("PATCH", `/api/categories/${b.id}/active`, { auth: t, body: { isActive: false } });
  assert.equal(off.status, 200);
  assert.equal(off.json.data.isActive, false);

  const publique = await http("GET", "/api/categories");
  assert.deepEqual(publique.json.data.map((c: any) => c.id), [a.id]);
  assert.equal((await http("GET", `/api/categories/${b.id}`)).status, 404);
  assert.equal((await http("GET", `/api/subcategories`)).json.data.length, 0);
  assert.equal((await liste()).json.data.length, 0);

  const admn = await http("GET", "/api/admin/categories", { auth: t });
  assert.equal(admn.json.data.length, 2);
  const cb = admn.json.data.find((c: any) => c.id === b.id);
  assert.equal(cb.isActive, false);
  assert.equal(cb.subCategories[0]._count.products, 1);

  // Idempotent et réversible
  await http("PATCH", `/api/categories/${b.id}/active`, { auth: t, body: { isActive: false } });
  await http("PATCH", `/api/categories/${b.id}/active`, { auth: t, body: { isActive: true } });
  assert.equal((await http("GET", "/api/categories")).json.data.length, 2);
  assert.equal((await liste()).json.data.length, 1);

  assert.equal((await http("PATCH", `/api/categories/${b.id}/active`, { auth: t, body: { isActive: "oui" } })).status, 400);
  assert.equal((await http("PATCH", `/api/categories/${b.id}/active`, { auth: t, body: {} })).status, 400);
});

test("Sous-catégories : même nom dans deux catégories, déplacement, doublons, désactivation", async () => {
  const t = await admin();
  const c1 = (await http("POST", "/api/categories", { auth: t, body: { name: "Maison" } })).json.data;
  const c2 = (await http("POST", "/api/categories", { auth: t, body: { name: "Mode" } })).json.data;

  const s1 = await http("POST", "/api/subcategories", { auth: t, body: { name: "Accessoires", categoryId: c1.id } });
  const s2 = await http("POST", "/api/subcategories", { auth: t, body: { name: "Accessoires", categoryId: c2.id } });
  assert.equal(s1.status, 201);
  assert.equal(s2.status, 201); // avant : erreur, le slug est unique dans toute la base
  assert.notEqual(s1.json.data.slug, s2.json.data.slug);

  const dup = await http("POST", "/api/subcategories", { auth: t, body: { name: "Accessoires", categoryId: c1.id } });
  assert.equal(dup.status, 400);
  assert.match(dup.json.message, /déjà existante/);

  const ren = await http("PATCH", `/api/subcategories/${s1.json.data.id}`, { auth: t, body: { name: "Déco" } });
  assert.equal(ren.status, 200);
  assert.equal(ren.json.data.slug, "deco");

  // Déplacer « Déco » vers Mode, où « Accessoires » existe déjà : pas de conflit (noms différents)
  const move = await http("PATCH", `/api/subcategories/${s1.json.data.id}`, { auth: t, body: { categoryId: c2.id } });
  assert.equal(move.status, 200);
  assert.equal(move.json.data.categoryId, c2.id);

  // Renommer « Déco » en « Accessoires » dans Mode : conflit
  const conflit = await http("PATCH", `/api/subcategories/${s1.json.data.id}`, { auth: t, body: { name: "Accessoires" } });
  assert.equal(conflit.status, 409);

  assert.equal((await http("PATCH", `/api/subcategories/${s1.json.data.id}`, { auth: t, body: { categoryId: "inconnue" } })).status, 404);

  const off = await http("PATCH", `/api/subcategories/${s2.json.data.id}/active`, { auth: t, body: { isActive: false } });
  assert.equal(off.status, 200);
  const publiques = await http("GET", "/api/subcategories");
  assert.deepEqual(publiques.json.data.map((s: any) => s.id), [s1.json.data.id]);
  assert.equal((await http("GET", `/api/subcategories/${s2.json.data.id}`)).status, 404);
});

test("Création de produit : refusée dans une sous-catégorie désactivée", async () => {
  const t = await admin();
  const cat = await creerCat("Active");
  const sous = await creerSous("Éteinte", cat.id, false);

  const r = await http("POST", "/api/admin/products", {
    auth: t,
    body: { name: "Table", price: 20, margin: 5, images: [], subCategoryId: sous.id },
  });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /désactivée/);
  assert.equal(await prisma.product.count(), 0);
});