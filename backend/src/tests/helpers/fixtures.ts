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