"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsufficientStockError = exports.ORDER_RESERVATION_MINUTES = void 0;
exports.reserveStockForOrder = reserveStockForOrder;
exports.releaseStockForOrder = releaseStockForOrder;
/** Durée pendant laquelle le stock d'une commande non payée reste réservé. */
exports.ORDER_RESERVATION_MINUTES = 60;
class InsufficientStockError extends Error {
    constructor(productName) {
        super(`Stock insuffisant pour « ${productName} »`);
        this.name = "InsufficientStockError";
    }
}
exports.InsufficientStockError = InsufficientStockError;
const reservedReason = (orderId) => `ORDER_RESERVED:${orderId}`;
const releasedReason = (orderId) => `ORDER_RELEASED:${orderId}`;
/**
 * Réserve le stock d'une commande : le stock est retiré tout de suite.
 * Chaque retrait est une seule instruction SQL conditionnelle (quantité >= demande),
 * donc impossible de descendre sous zéro, même avec des commandes simultanées.
 * À appeler dans la transaction qui crée la commande : si une ligne échoue,
 * tout est annulé (aucun stock n'est retiré à moitié).
 */
async function reserveStockForOrder(tx, orderId, lines) {
    // On fusionne les lignes d'un même produit et on les traite dans un ordre stable
    // (évite les blocages croisés entre deux commandes simultanées).
    const wanted = new Map();
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
async function releaseStockForOrder(tx, orderId) {
    const alreadyReleased = await tx.inventoryMovement.findFirst({
        where: { reason: releasedReason(orderId) },
    });
    if (alreadyReleased)
        return false;
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
