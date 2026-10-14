import { prisma } from "../lib/prisma";
import { randomUUID } from "crypto";
import { createDeposit } from "./pawapay.service";
import { PAYMENT_CURRENCY } from "./payment.settlement.service";

type PaymentType = "PRODUCT" | "SHIPPING" | "FULL";

// Une commande n'accepte un paiement que dans ces statuts.
const PAYABLE_ORDER_STATUSES = ["PENDING_PAYMENT", "PARTIALLY_PAID"];

// Arrondi au centime pour éviter les erreurs de virgule flottante.
const roundCents = (value: unknown) => Math.round(Number(value) * 100) / 100;

export async function createPayment(
  orderId: string,
  userId: string,
  phoneNumber: string,
  provider: string,
  paymentType: PaymentType
) {
  // On génère l'identifiant du dépôt AVANT tout : il est enregistré dès la création
  // du paiement, pour qu'un paiement soit toujours réconciliable même si le serveur
  // plante pendant l'appel à PawaPay.
  const depositId = randomUUID();

  const payment = await prisma.$transaction(async (tx) => {
    // On verrouille la commande (et on vérifie qu'elle appartient bien au client) :
    // deux demandes simultanées passent l'une après l'autre.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order"
      WHERE id = ${orderId} AND "userId" = ${userId}
      FOR UPDATE
    `;

    if (locked.length === 0) {
      throw new Error("Commande introuvable");
    }

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

    if (!PAYABLE_ORDER_STATUSES.includes(order.status)) {
      throw new Error("Cette commande n'est plus payable");
    }

    // Paiements déjà réglés ou en cours sur cette commande
    const active = await tx.payment.findMany({
      where: { orderId, status: { in: ["PAID", "PENDING"] } },
      select: { type: true },
    });
    const activeTypes = active.map((p) => p.type);

    if (activeTypes.includes("FULL")) {
      throw new Error("Un paiement complet existe déjà pour cette commande");
    }
    if (paymentType === "FULL" && activeTypes.length > 0) {
      throw new Error(
        "Un paiement partiel existe déjà : payez le reste par type PRODUCT ou SHIPPING"
      );
    }
    if (activeTypes.includes(paymentType)) {
      throw new Error(`Le paiement ${paymentType} existe déjà`);
    }

    let amount: number;
    switch (paymentType) {
      case "PRODUCT":
        amount = roundCents(order.productsAmount);
        break;
      case "SHIPPING":
        amount = roundCents(order.shippingAmount);
        break;
      case "FULL":
        amount = roundCents(order.totalAmount);
        break;
      default:
        throw new Error("Type de paiement invalide");
    }

    if (!(amount > 0)) {
      throw new Error("Aucun montant à payer pour ce type de paiement");
    }

    return tx.payment.create({
      data: {
        orderId,
        amount,
        type: paymentType,
        status: "PENDING",
        providerReference: depositId,
      },
    });
  });

  try {
    const pawapayResponse = await createDeposit({
      depositId,
      amount: payment.amount.toString(),
      currency: PAYMENT_CURRENCY,
      phoneNumber,
      provider,
      customerMessage: "Paiement A&T Market",
      orderId,
    });

    // PawaPay peut répondre HTTP 200 avec un statut REJECTED : le dépôt n'existe pas.
    if (pawapayResponse.status === "REJECTED") {
      throw new Error("Paiement refusé par PawaPay");
    }
  } catch (error: any) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "FAILED" },
    });

    throw new Error(error.message || "Paiement PawaPay échoué");
  }

  return payment;
}