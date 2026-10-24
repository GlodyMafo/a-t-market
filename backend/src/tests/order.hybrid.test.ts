import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { FakePawapay } from "./helpers/fakePawapay";
import {
  creerAdmin,
  creerDevis,
  creerProduit,
  creerReglages,
  creerSousCategorie,
  creerUtilisateur,
  remplirPanier,
  stockDe,
} from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import { addQuoteToCart, addToCart } from "../services/cart.service";
import { createOrderFromCart, getOrderById } from "../services/order.service";
import { expireUnpaidOrders } from "../services/order.expiration.service";
import { approveQuote, rejectQuote } from "../services/internationalQuote.admin.service";
import { createPayment } from "../services/payment.service";
import { settlePaymentByDepositId } from "../services/payment.settlement.service";
import { createInternationalQuote } from "../services/internationalQuote.service";

const pawapay = new FakePawapay();

before(async () => {
  await startTestDb();
  await pawapay.start();
});
after(async () => {
  await pawapay.stop();
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  pawapay.reset();
});

/** Panier mixte : 1 iPhone local (520 + 15 = 535 $) + 1 devis international (38 $). */
async function panierMixte() {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 5, price: "520.00", margin: "15.00", name: "Iphone" });
  await addToCart({ userId: user.id, productId: produit.id, quantity: 1 });
  const quote = await creerDevis(user.id, { name: "Robe fleurie" });
  await addQuoteToCart(user.id, quote.id);
  return { user, produit, quote };
}

async function vieillir(orderId: string, minutes: number) {
  await prisma.order.update({
    where: { id: orderId },
    data: { createdAt: new Date(Date.now() - minutes * 60 * 1000) },
  });
}

// =============== Commande mixte : montants et contenu ===============

test("Commande mixte : montants exacts (produits 566, transport 7, total 573) et articles corrects", async () => {
  const { user, produit, quote } = await panierMixte();

  const order = await createOrderFromCart(user.id);

  assert.equal(order.status, "PENDING_PAYMENT");
  assert.equal(order.productsAmount.toString(), "566"); // 535 + (38 - 7)
  assert.equal(order.shippingAmount.toString(), "7");
  assert.equal(order.totalAmount.toString(), "573");
  assert.equal(order.items.length, 2);

  const articleLocal = order.items.find((i) => i.productId === produit.id)!;
  assert.equal(articleLocal.quoteId, null);
  assert.equal(articleLocal.price.toString(), "535");
  assert.equal(articleLocal.quoteSnapshot, null);

  const articleDevis = order.items.find((i) => i.quoteId === quote.id)!;
  assert.equal(articleDevis.productId, null);
  assert.equal(articleDevis.quantity, 1);
  assert.equal(articleDevis.price.toString(), "38");
  assert.equal(articleDevis.basePrice.toString(), "20");
  assert.equal(articleDevis.margin.toString(), "18");
});

test("L'article-devis conserve une COPIE FIGÉE : lien, nom, options, détail des montants", async () => {
  const user = await creerUtilisateur();
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const quote = await createInternationalQuote(
    user.id, "https://www.shein.com/Robe-p-9.html", "Robe fleurie", 20, sub.id, undefined, "Taille M, noir"
  );
  await addQuoteToCart(user.id, quote.id);

  const order = await createOrderFromCart(user.id);

  const snap = order.items[0].quoteSnapshot as Record<string, unknown>;
  assert.equal(snap.quoteId, quote.id);
  assert.equal(snap.productUrl, "https://www.shein.com/Robe-p-9.html");
  assert.equal(snap.productName, "Robe fleurie");
  assert.equal(snap.options, "Taille M, noir");
  assert.equal(snap.productPrice, "20");
  assert.equal(snap.shippingCost, "7");
  assert.equal(snap.commissionCost, "3");
  assert.equal(snap.totalPrice, "38");
  assert.equal(snap.weightSource, "CATALOG_ESTIMATE");
});

test("Stock : seuls les produits LOCAUX sont réservés ; le devis ne touche pas au stock", async () => {
  const { user, produit, quote } = await panierMixte();

  const order = await createOrderFromCart(user.id);

  assert.equal(await stockDe(produit.id), 4);
  const mouvements = await prisma.inventoryMovement.findMany();
  assert.equal(mouvements.length, 1);
  assert.equal(mouvements[0].reason, `ORDER_RESERVED:${order.id}`);
  assert.equal(mouvements[0].productId, produit.id);
  assert.ok(quote.id);
});

test("Le panier est vidé après la commande (produits ET devis)", async () => {
  const { user } = await panierMixte();

  await createOrderFromCart(user.id);

  assert.equal(await prisma.cartItem.count(), 0);
});

test("Panier avec un seul devis : commande possible, aucun mouvement de stock (31 + 7 = 38)", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id);
  await addQuoteToCart(user.id, quote.id);

  const order = await createOrderFromCart(user.id);

  assert.equal(order.productsAmount.toString(), "31");
  assert.equal(order.shippingAmount.toString(), "7");
  assert.equal(order.totalAmount.toString(), "38");
  assert.equal(await prisma.inventoryMovement.count(), 0);
});

test("Montants en décimal exact : 3 x (0,10 + 0,20) + devis de 10,10 $ (1 kg) = 34,52", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 5, price: "0.10", margin: "0.20" });
  await addToCart({ userId: user.id, productId: produit.id, quantity: 3 });
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "1" });
  const quote = await createInternationalQuote(user.id, "https://www.shein.com/x-p-1.html", "T", 10.1, sub.id);
  await addQuoteToCart(user.id, quote.id);

  const order = await createOrderFromCart(user.id);

  assert.equal(quote.totalPrice.toString(), "33.62");
  assert.equal(order.shippingAmount.toString(), "14");
  assert.equal(order.productsAmount.toString(), "20.52"); // 0.90 + (33.62 - 14)
  assert.equal(order.totalAmount.toString(), "34.52");
});

test("Panier local seul : comportement inchangé", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 5, price: "520.00", margin: "15.00" });
  await remplirPanier(user.id, [{ productId: produit.id, quantity: 2 }]);

  const order = await createOrderFromCart(user.id);

  assert.equal(order.totalAmount.toString(), "1070");
  assert.equal(order.shippingAmount.toString(), "0");
});

// =============== Règle D et refus ===============

test("RÈGLE D : un devis EN ATTENTE bloque la commande (et rien n'est réservé ni créé)", async () => {
  const user = await creerUtilisateur();
  const produit = await creerProduit({ stock: 5, price: "10.00" });
  await addToCart({ userId: user.id, productId: produit.id, quantity: 2 });
  const pending = await creerDevis(user.id, { avecPoids: false, name: "Manteau" });
  await addQuoteToCart(user.id, pending.id);

  await assert.rejects(createOrderFromCart(user.id), /« Manteau » est en attente de validation.*ne peut pas encore être payé/);

  assert.equal(await prisma.order.count(), 0);
  assert.equal(await stockDe(produit.id), 5);
  assert.equal(await prisma.cartItem.count(), 2); // le panier est intact
  assert.equal(await prisma.inventoryMovement.count(), 0);
});

test("Un devis rejeté, périmé ou déjà commandé bloque la commande avec le bon message", async () => {
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const produit = await creerProduit({ stock: 5, price: "10.00" });
  await addToCart({ userId: user.id, productId: produit.id, quantity: 1 });

  const rejete = await creerDevis(user.id, { name: "Rejeté" });
  const perime = await creerDevis(user.id, { name: "Périmé" });
  await addQuoteToCart(user.id, rejete.id);
  await addQuoteToCart(user.id, perime.id);
  await rejectQuote(rejete.id, admin.id, "Produit interdit");
  await prisma.internationalQuote.update({ where: { id: perime.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

  await assert.rejects(createOrderFromCart(user.id), (e: Error) =>
    /« Rejeté » a été rejeté/.test(e.message) && /« Périmé » a expiré/.test(e.message)
  );
  assert.equal(await prisma.order.count(), 0);
  assert.equal(await stockDe(produit.id), 5);
});

test("Devis déjà dans une commande active : une seconde commande est refusée", async () => {
  const user = await creerUtilisateur();
  const quote = await creerDevis(user.id, { name: "Robe" });
  await addQuoteToCart(user.id, quote.id);
  await createOrderFromCart(user.id);
  // on force le même devis dans le panier (état impossible par l'API, mais la base ne l'interdit pas)
  const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id } });
  await prisma.cartItem.create({ data: { cartId: cart.id, quoteId: quote.id } });

  await assert.rejects(createOrderFromCart(user.id), /déjà dans une commande/);
  assert.equal(await prisma.order.count(), 1);
});

test("Devis d'un AUTRE client glissé dans le panier : refusé (jamais commandé)", async () => {
  const proprietaire = await creerUtilisateur();
  const intrus = await creerUtilisateur();
  const quote = await creerDevis(proprietaire.id);
  const cart = await prisma.cart.create({ data: { userId: intrus.id } });
  await prisma.cartItem.create({ data: { cartId: cart.id, quoteId: quote.id } });

  await assert.rejects(createOrderFromCart(intrus.id), /introuvable/);
  assert.equal(await prisma.order.count(), 0);
});

test("Stock insuffisant sur un produit local : toute la commande est annulée, le devis reste disponible", async () => {
  const { user, produit, quote } = await panierMixte();
  await prisma.inventory.update({ where: { productId: produit.id }, data: { quantity: 0 } });

  await assert.rejects(createOrderFromCart(user.id), /Stock insuffisant/);

  assert.equal(await prisma.order.count(), 0);
  assert.equal(await prisma.orderItem.count(), 0);
  assert.equal(await prisma.cartItem.count(), 2);
  const pas = await prisma.orderItem.count({ where: { quoteId: quote.id } });
  assert.equal(pas, 0);
});

test("Produit local désactivé + devis valide : refusé avec le message du produit", async () => {
  const { user, produit } = await panierMixte();
  await prisma.product.update({ where: { id: produit.id }, data: { isActive: false } });

  await assert.rejects(createOrderFromCart(user.id), /« Iphone » n'est plus disponible/);
  assert.equal(await prisma.order.count(), 0);
});

test("Double clic sur Commander avec un devis : une seule commande", async () => {
  const { user } = await panierMixte();

  const r = await Promise.allSettled([createOrderFromCart(user.id), createOrderFromCart(user.id)]);

  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await prisma.order.count(), 1);
});

// =============== Validation admin puis commande ===============

test("Devis en attente : impayable, puis payable après approbation admin (prix définitif)", async () => {
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const pending = await creerDevis(user.id, { avecPoids: false });
  await addQuoteToCart(user.id, pending.id);

  await assert.rejects(createOrderFromCart(user.id), /en attente de validation/);

  await approveQuote(pending.id, admin.id, { weightKg: 0.5 });
  const order = await createOrderFromCart(user.id);

  assert.equal(order.totalAmount.toString(), "38");
  assert.equal(order.shippingAmount.toString(), "7");
});

// =============== Prix figé et historique protégé ===============

test("Le prix de la commande est FIGÉ : changer les réglages ne le modifie pas", async () => {
  const { user } = await panierMixte();
  const order = await createOrderFromCart(user.id);

  await prisma.globalSettings.updateMany({ data: { commissionRate: "50", chinaPricePerKg: "100", fixedFee: "40" } });

  const relue = await getOrderById(order.id, user.id);
  assert.equal(relue.totalAmount.toString(), "573");
  const snap = relue.items.find((i) => i.quoteId)!.quoteSnapshot as Record<string, unknown>;
  assert.equal(snap.totalPrice, "38");
});

test("Un devis dans une commande active ne peut plus être rejeté ; après annulation de la commande, oui", async () => {
  const user = await creerUtilisateur();
  const admin = await creerAdmin();
  const quote = await creerDevis(user.id);
  await addQuoteToCart(user.id, quote.id);
  const order = await createOrderFromCart(user.id);

  await assert.rejects(rejectQuote(quote.id, admin.id, "Trop tard"), /déjà utilisé dans une commande/);
  assert.equal((await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } })).status, "AUTO_APPROVED");

  await vieillir(order.id, 120);
  await expireUnpaidOrders();

  const rejete = await rejectQuote(quote.id, admin.id, "Produit retiré");
  assert.equal(rejete.status, "REJECTED");
});

test("Commande hybride non payée qui expire : stock libéré ET devis de nouveau commandable", async () => {
  const { user, produit, quote } = await panierMixte();
  const order = await createOrderFromCart(user.id);
  assert.equal(await stockDe(produit.id), 4);
  await vieillir(order.id, 90);

  assert.equal(await expireUnpaidOrders(), 1);

  assert.equal(await stockDe(produit.id), 5);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "CANCELLED");
  // le client peut recommander : produit et devis sont de nouveau disponibles
  await addToCart({ userId: user.id, productId: produit.id, quantity: 1 });
  const r = await addQuoteToCart(user.id, quote.id);
  assert.equal(r.status, "ADDED");
  const nouvelle = await createOrderFromCart(user.id);
  assert.equal(nouvelle.totalAmount.toString(), "573");
});

test("Lecture d'une commande : l'article-devis a product = null et son quoteSnapshot", async () => {
  const { user } = await panierMixte();
  const order = await createOrderFromCart(user.id);

  const relue = await getOrderById(order.id, user.id);

  const articleDevis = relue.items.find((i) => i.quoteId)!;
  assert.equal(articleDevis.product, null);
  assert.ok(articleDevis.quoteSnapshot);
  assert.ok(relue.items.find((i) => i.productId)!.product);
});

// =============== Paiement d'une commande hybride ===============

const payer = (orderId: string, userId: string, type: "FULL" | "PRODUCT" | "SHIPPING") =>
  createPayment(orderId, userId, "0990000001", "AIRTEL", type);

test("Paiement FULL d'une commande hybride : 573 $ envoyés à PawaPay", async () => {
  const { user } = await panierMixte();
  const order = await createOrderFromCart(user.id);

  const p = await payer(order.id, user.id, "FULL");

  assert.equal(Number(p.amount), 573);
  assert.equal(Number(pawapay.deposits[0].amount), 573);
});

test("Paiements PRODUCT (566) puis SHIPPING (7) : montants corrects, commande PAID après les deux", async () => {
  const { user } = await panierMixte();
  const order = await createOrderFromCart(user.id);

  const p1 = await payer(order.id, user.id, "PRODUCT");
  const p2 = await payer(order.id, user.id, "SHIPPING");
  assert.equal(Number(p1.amount), 566);
  assert.equal(Number(p2.amount), 7);

  for (const [p, montant] of [[p1, "566"], [p2, "7"]] as const) {
    await settlePaymentByDepositId(p.providerReference!, async () => ({
      status: "FOUND",
      data: { depositId: p.providerReference!, status: "COMPLETED", amount: montant, currency: "USD" },
    }));
  }

  const finale = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(finale.status, "PAID");
});

test("Règlement d'une commande hybride : PAID, sans toucher au stock ni au devis", async () => {
  const { user, produit, quote } = await panierMixte();
  const order = await createOrderFromCart(user.id);
  const p = await payer(order.id, user.id, "FULL");

  const r = await settlePaymentByDepositId(p.providerReference!, async () => ({
    status: "FOUND",
    data: { depositId: p.providerReference!, status: "COMPLETED", amount: "573", currency: "USD" },
  }));

  assert.equal(r.outcome, "PAID");
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PAID");
  assert.equal(await stockDe(produit.id), 4); // réservé à la commande, pas retiré une seconde fois
  const q = await prisma.internationalQuote.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(q.totalPrice.toString(), "38");
});

test("Une commande payée n'est jamais annulée par l'expiration (devis et stock conservés)", async () => {
  const { user, produit } = await panierMixte();
  const order = await createOrderFromCart(user.id);
  const p = await payer(order.id, user.id, "FULL");
  await settlePaymentByDepositId(p.providerReference!, async () => ({
    status: "FOUND",
    data: { depositId: p.providerReference!, status: "COMPLETED", amount: "573", currency: "USD" },
  }));
  await vieillir(order.id, 500);

  assert.equal(await expireUnpaidOrders(), 0);
  assert.equal(await stockDe(produit.id), 4);
});