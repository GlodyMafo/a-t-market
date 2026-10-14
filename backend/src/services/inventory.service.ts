import { Prisma } from "../../generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** Durée pendant laquelle le stock d'une commande non payée reste réservé. */
export const ORDER_RESERVATION_MINUTES = 60;

export interface StockLine {
  productId: string;
  quantity: number;
}

export class InsufficientStockError extends Error {
  constructor(productName: string) {
    super(`Stock insuffisant pour « ${productName} »`);
    this.name = "InsufficientStockError";
  }
}

const reservedReason = (orderId: string) => `ORDER_RESERVED:${orderId}`;
const releasedReason = (orderId: string) => `ORDER_RELEASED:${orderId}`;

/**
 * Réserve le stock d'une commande : le stock est retiré tout de suite.
 * Chaque retrait est une seule instruction SQL conditionnelle (quantité >= demande),
 * donc impossible de descendre sous zéro, même avec des commandes simultanées.
 * À appeler dans la transaction qui crée la commande : si une ligne échoue,
 * tout est annulé (aucun stock n'est retiré à moitié).
 */
export async function reserveStockForOrder(
  tx: Tx,
  orderId: string,
  lines: StockLine[]
) {
  // On fusionne les lignes d'un même produit et on les traite dans un ordre stable
  // (évite les blocages croisés entre deux commandes simultanées).
  const wanted = new Map<string, number>();
  for (const line of lines) {
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.quantity);
  }
  const ordered = [...wanted.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [productId, quantity] of ordered) {
    const result = await tx.inventory.updateMany({
      where: { productId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });

    if (result.count === 0) {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { name: true },
      });
      throw new InsufficientStockError(product?.name ?? productId);
    }

    await tx.inventoryMovement.create({
      data: {
        productId,
        quantity,
        type: "OUT",
        reason: reservedReason(orderId),
      },
    });
  }
}

/**
 * Remet en stock ce qui avait été réservé pour une commande.
 * Idempotent : un second appel ne remet rien (pas de stock créé de nulle part).
 * Retourne true si du stock a été libéré.
 */
export async function releaseStockForOrder(tx: Tx, orderId: string) {
  const alreadyReleased = await tx.inventoryMovement.findFirst({
    where: { reason: releasedReason(orderId) },
  });
  if (alreadyReleased) return false;

  const reserved = await tx.inventoryMovement.findMany({
    where: { reason: reservedReason(orderId), type: "OUT" },
  });

  for (const movement of reserved) {
    await tx.inventory.update({
      where: { productId: movement.productId },
      data: { quantity: { increment: movement.quantity } },
    });

    await tx.inventoryMovement.create({
      data: {
        productId: movement.productId,
        quantity: movement.quantity,
        type: "IN",
        reason: releasedReason(orderId),
      },
    });
  }

  return reserved.length > 0;
}