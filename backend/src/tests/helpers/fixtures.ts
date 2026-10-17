import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";

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
  opts?: { commission?: string; perKg?: string; fee?: string }
) {
  return prisma.globalSettings.create({
    data: {
      commissionRate: opts?.commission ?? "15",
      chinaPricePerKg: opts?.perKg ?? "14",
      fixedFee: opts?.fee ?? "8",
    },
  });
}

export async function creerAdmin() {
  return prisma.user.create({
    data: { email: `admin-${randomUUID()}@test.local`, password: "x", role: "ADMIN" },
  });
}