import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { createInternationalQuote } from "../../services/internationalQuote.service";
import {
  QuotePreviewTicketData,
  signQuotePreviewTicket,
} from "../../services/quotePreviewTicket";

export async function creerCommande(opts?: {
  total?: string;
  products?: string;
  shipping?: string;
  status?: "PENDING_PAYMENT" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
}) {
  const user = await prisma.user.create({
    data: {
      email: `u-${randomUUID()}@test.local`,
      password: "x",
    },
  });
  const total = opts?.total ?? "34.00";
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      status: opts?.status ?? "PENDING_PAYMENT",
      productsAmount: opts?.products ?? total,
      shippingAmount: opts?.shipping ?? "0",
      totalAmount: total,
    },
  });
  return { user, order };
}

export async function creerPaiement(
  orderId: string,
  amount: string,
  type: "FULL" | "PRODUCT" | "SHIPPING" = "FULL"
) {
  const depositId = randomUUID();
  const payment = await prisma.payment.create({
    data: {
      orderId,
      amount,
      type,
      status: "PENDING",
      providerReference: depositId,
    },
  });
  return { payment, depositId };
}

export async function creerUtilisateur() {
  return prisma.user.create({
    data: { email: `u-${randomUUID()}@test.local`, password: "x" },
  });
}

export async function creerProduit(opts?: {
  stock?: number;
  price?: string;
  margin?: string;
  type?: "LOCAL" | "INTERNATIONAL";
  isActive?: boolean;
  name?: string;
}) {
  const id = randomUUID();
  const type = opts?.type ?? "LOCAL";
  return prisma.product.create({
    data: {
      name: opts?.name ?? `Produit ${id.slice(0, 6)}`,
      slug: `produit-${id}`,
      price: opts?.price ?? "10.00",
      margin: opts?.margin ?? "0",
      type,
      isActive: opts?.isActive ?? true,
      ...(type === "LOCAL"
        ? { inventory: { create: { quantity: opts?.stock ?? 5 } } }
        : {}),
    },
  });
}

export async function remplirPanier(
  userId: string,
  items: { productId: string; quantity: number }[]
) {
  const cart = await prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  for (const item of items) {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: item.productId, quantity: item.quantity },
    });
  }
  return cart;
}

export async function stockDe(productId: string) {
  const inv = await prisma.inventory.findUniqueOrThrow({ where: { productId } });
  return inv.quantity;
}

export async function creerSousCategorie(opts?: { weightKg?: string; active?: boolean }) {
  const id = randomUUID();
  const category = await prisma.category.create({
    data: { name: `Cat ${id}`, slug: `cat-${id}`, isActive: opts?.active ?? true },
  });
  const sub = await prisma.subCategory.create({
    data: {
      name: `Sous ${id}`,
      slug: `sous-${id}`,
      categoryId: category.id,
      isActive: opts?.active ?? true,
    },
  });
  if (opts?.weightKg) {
    await prisma.weightCatalog.create({
      data: { subCategoryId: sub.id, estimatedWeightKg: opts.weightKg },
    });
  }
  return sub;
}


export async function creerReglages(
  opts?: {
    commission?: string;
    perKg?: string;
    fee?: string;
    aedToUsdRate?: string | null;
    cnyToUsdRate?: string | null;
  }
) {
  return prisma.globalSettings.create({
    data: {
      commissionRate: opts?.commission ?? "15",
      chinaPricePerKg: opts?.perKg ?? "14",
      fixedFee: opts?.fee ?? "8",
      aedToUsdRate: opts?.aedToUsdRate ?? null,
      cnyToUsdRate: opts?.cnyToUsdRate ?? null,
    },
  });
}

export async function creerAdmin() {
  return prisma.user.create({
    data: { email: `admin-${randomUUID()}@test.local`, password: "x", role: "ADMIN" },
  });
}

export async function assurerReglages() {
  if ((await prisma.globalSettings.count()) === 0) {
    await creerReglages();
  }
}

/**
 * Devis SHEIN à 20 $. Avec poids (par défaut) : AUTO_APPROVED, total 38 $ (transport 7, commission 3, frais 8).
 * Sans poids : PENDING_REVIEW, total provisoire 31 $.
 */
export async function creerDevis(
  userId: string,
  opts?: { avecPoids?: boolean; price?: number; name?: string }
) {
  await assurerReglages();
  const sub = await creerSousCategorie(opts?.avecPoids === false ? undefined : { weightKg: "0.5" });
  return createInternationalQuote(
    userId,
    `https://www.shein.com/p-${randomUUID()}.html`,
    opts?.name ?? "Robe fleurie",
    opts?.price ?? 20,
    sub.id
  );
}

/** Ticket d'aperçu signé (20 $, 0,5 kg, taux 15 % / 14 $ / 8 $) pour la sous-catégorie donnée. */
export function ticketPour(
  subCategoryId: string,
  opts?: { over?: Partial<QuotePreviewTicketData>; now?: Date }
) {
  return signQuotePreviewTicket(
    {
      productUrl: "https://www.shein.com/x-p-1.html",
      productName: "Robe fleurie",
      imageUrl: null,
      productPrice: "20",
      weightKg: "0.5",
      weightSource: "CATALOG_ESTIMATE",
      subCategoryId,
      commissionRate: "15",
      chinaPricePerKg: "14",
      fixedFee: "8",
      ...opts?.over,
    },
    opts?.now
  );
}