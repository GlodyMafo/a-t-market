"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrderFromCart = createOrderFromCart;
exports.countOrdersByUser = countOrdersByUser;
exports.getOrdersByUser = getOrdersByUser;
exports.getOrderById = getOrderById;
const client_1 = require("../../generated/prisma/client");
const prisma_1 = require("../lib/prisma");
const inventory_service_1 = require("./inventory.service");
const quoteEligibility_1 = require("./quoteEligibility");
const quoteSnapshot_1 = require("./quoteSnapshot");
const productAvailability_1 = require("./productAvailability");
const productUrl_1 = require("./productUrl");
const pricing_service_1 = require("./pricing.service");
const notification_service_1 = require("./notification.service");
const admin_email_service_1 = require("./admin.email.service");
const Decimal = client_1.Prisma.Decimal;
/**
 * Recalcule le devis 1688 pour la quantité demandée.
 *
 * Le prix et le poids enregistrés dans le devis sont unitaires.
 * Le transport et la commission sont calculés sur les totaux.
 * Les frais fixes ne sont appliqués qu'une seule fois.
 */
function calculate1688CartPricing(quote, quantity) {
    if (quote.commissionRate === null ||
        quote.chinaPricePerKg === null ||
        quote.fixedFee === null) {
        throw new Error("Les paramètres tarifaires du devis 1688 sont incomplets.");
    }
    return (0, pricing_service_1.computeQuote)({
        productPrice: quote.productPrice.mul(quantity),
        weightKg: quote.productWeight === null
            ? null
            : quote.productWeight.mul(quantity),
        settings: {
            commissionRate: quote.commissionRate,
            chinaPricePerKg: quote.chinaPricePerKg,
            fixedFee: quote.fixedFee,
        },
    });
}
/**
 * Crée une commande à partir du panier : produits locaux et devis internationaux.
 *
 * - Produits locaux : le stock est réservé (échec => tout est annulé).
 * - Devis internationaux : chacun doit être payable.
 * - 1688 : le MOQ est contrôlé avant la création de la commande.
 * - 1688 : prix et poids sont recalculés selon la quantité du panier.
 * - SHEIN et NOON : calcul et quantité historiques conservés.
 */
async function createOrderFromCart(userId) {
    const cartRef = await prisma_1.prisma.cart.findUnique({
        where: { userId },
        select: { id: true },
    });
    if (!cartRef) {
        throw new Error("Panier introuvable");
    }
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        // Verrouillage du panier pour éviter les commandes concurrentes.
        await tx.$queryRaw `
      SELECT id FROM "Cart" WHERE id = ${cartRef.id} FOR UPDATE
    `;
        const cart = await tx.cart.findUniqueOrThrow({
            where: { id: cartRef.id },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                subCategory: productAvailability_1.categoryChainSelect,
                            },
                        },
                    },
                },
            },
        });
        if (cart.items.length === 0) {
            throw new Error("Le panier est vide");
        }
        // Verrouillage des devis internationaux.
        const quoteIds = cart.items
            .flatMap((item) => (item.quoteId ? [item.quoteId] : []))
            .sort();
        if (quoteIds.length > 0) {
            await tx.$queryRaw `
        SELECT id FROM "InternationalQuote"
        WHERE id IN (${client_1.Prisma.join(quoteIds)})
        ORDER BY id
        FOR UPDATE
      `;
        }
        const quotes = await tx.internationalQuote.findMany({
            where: {
                id: { in: quoteIds },
                userId,
            },
        });
        const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
        const ordered = await (0, quoteEligibility_1.activeOrderQuoteIds)(tx, quoteIds);
        // Contrôle de tous les articles avant toute création.
        const problems = [];
        for (const item of cart.items) {
            if (item.quoteId) {
                const quote = quoteById.get(item.quoteId);
                if (!quote) {
                    problems.push("Un devis de votre panier est introuvable.");
                    continue;
                }
                const issue = (0, quoteEligibility_1.quoteIssue)(quote, ordered.has(quote.id));
                if (issue) {
                    problems.push((0, quoteEligibility_1.quoteIssueMessage)(issue, quote.productName));
                }
                const marketplace = (0, productUrl_1.detectProductMarketplace)(quote.productUrl);
                if (marketplace === "1688") {
                    if (quote.minOrderQuantity !== null &&
                        quote.minOrderQuantity > 0 &&
                        item.quantity < quote.minOrderQuantity) {
                        problems.push(`Quantité insuffisante pour « ${quote.productName ?? "produit 1688"} » : minimum requis ${quote.minOrderQuantity}, quantité demandée ${item.quantity}.`);
                    }
                    // Vérifie également les paramètres et les limites tarifaires
                    // avant de commencer la création de la commande.
                    try {
                        calculate1688CartPricing(quote, item.quantity);
                    }
                    catch (error) {
                        problems.push(error instanceof Error
                            ? `Devis 1688 « ${quote.productName ?? "sans nom"} » : ${error.message}`
                            : "Impossible de calculer le prix du devis 1688.");
                    }
                }
                else if (item.quantity !== 1) {
                    // Défense supplémentaire : SHEIN et NOON restent à quantité 1.
                    problems.push(`La quantité des devis SHEIN et NOON doit rester égale à 1 (${quote.productName ?? "produit"}).`);
                }
            }
            else if (!item.product ||
                !item.product.isActive ||
                !(0, productAvailability_1.isCategoryActive)(item.product.subCategory)) {
                problems.push(`Le produit « ${item.product?.name ?? "inconnu"} » n'est plus disponible`);
            }
        }
        if (problems.length > 0) {
            throw new Error(problems.join(" "));
        }
        // Calcul des montants en Decimal.
        let productsAmount = new Decimal(0);
        let shippingAmount = new Decimal(0);
        const itemsData = [];
        const stockLines = [];
        for (const item of cart.items) {
            if (item.quoteId) {
                const quote = quoteById.get(item.quoteId);
                const marketplace = (0, productUrl_1.detectProductMarketplace)(quote.productUrl);
                if (marketplace === "1688") {
                    const pricing = calculate1688CartPricing(quote, item.quantity);
                    const shippingPart = pricing.shippingCost.plus(pricing.customsCost);
                    // productsAmount contient le produit, la commission et les frais fixes.
                    // shippingAmount contient uniquement le transport et les douanes.
                    productsAmount = productsAmount
                        .plus(pricing.productPrice)
                        .plus(pricing.commissionCost)
                        .plus(pricing.fixedFee);
                    shippingAmount = shippingAmount.plus(shippingPart);
                    itemsData.push({
                        quote: { connect: { id: quote.id } },
                        quantity: item.quantity,
                        basePrice: quote.productPrice,
                        margin: pricing.totalPrice.minus(pricing.productPrice),
                        price: pricing.totalPrice,
                        // Le devis d'origine reste inchangé et constitue la référence historique.
                        quoteSnapshot: (0, quoteSnapshot_1.quoteSnapshot)(quote),
                    });
                }
                else {
                    // SHEIN et NOON : comportement historique inchangé.
                    const shippingPart = quote.shippingCost.plus(quote.customsCost);
                    shippingAmount = shippingAmount.plus(shippingPart);
                    productsAmount = productsAmount.plus(quote.totalPrice.minus(shippingPart));
                    itemsData.push({
                        quote: { connect: { id: quote.id } },
                        quantity: 1,
                        basePrice: quote.productPrice,
                        margin: quote.totalPrice.minus(quote.productPrice),
                        price: quote.totalPrice,
                        quoteSnapshot: (0, quoteSnapshot_1.quoteSnapshot)(quote),
                    });
                }
            }
            else {
                const product = item.product;
                const unitPrice = new Decimal(product.price).plus(product.margin);
                productsAmount = productsAmount.plus(unitPrice.mul(item.quantity));
                itemsData.push({
                    product: { connect: { id: product.id } },
                    quantity: item.quantity,
                    basePrice: product.price,
                    margin: product.margin,
                    price: unitPrice,
                });
                if (product.type === "LOCAL") {
                    stockLines.push({
                        productId: product.id,
                        quantity: item.quantity,
                    });
                }
            }
        }
        const totalAmount = productsAmount.plus(shippingAmount);
        const createdOrder = await tx.order.create({
            data: {
                userId,
                productsAmount,
                shippingAmount,
                totalAmount,
                status: "PENDING_PAYMENT",
                items: {
                    create: itemsData,
                },
            },
            include: {
                items: true,
            },
        });
        // Réservation du stock local : toute erreur annule la transaction.
        await (0, inventory_service_1.reserveStockForOrder)(tx, createdOrder.id, stockLines);
        await tx.cartItem.deleteMany({
            where: { cartId: cart.id },
        });
        const notification = await (0, notification_service_1.recordNotification)(tx, {
            userId,
            type: "ORDER_CREATED",
            orderId: createdOrder.id,
            title: "Commande créée",
            message: `Votre commande ${(0, notification_service_1.orderRef)(createdOrder.id)} a été créée. Montant total : ${(0, notification_service_1.formatUsd)(createdOrder.totalAmount)}.`,
            emailWanted: true,
            data: {
                totalAmount: createdOrder.totalAmount.toString(),
            },
        });
        return {
            createdOrder,
            notification,
        };
    });
    (0, notification_service_1.publishNotification)(result.notification);
    void (0, admin_email_service_1.notifyAdmin)(result.notification);
    return result.createdOrder;
}
// Get all orders by user
async function countOrdersByUser(userId) {
    return prisma_1.prisma.order.count({
        where: { userId },
    });
}
async function getOrdersByUser(userId, paging) {
    return prisma_1.prisma.order.findMany({
        ...paging,
        where: { userId },
        include: {
            items: {
                include: {
                    product: {
                        include: {
                            images: true,
                        },
                    },
                },
            },
        },
        orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
        ],
    });
}
async function getOrderById(id, userId) {
    const order = await prisma_1.prisma.order.findFirst({
        where: {
            id,
            userId,
        },
        include: {
            items: {
                include: {
                    product: {
                        include: {
                            images: true,
                        },
                    },
                },
            },
            payments: true,
            trackingEvents: {
                orderBy: [
                    { createdAt: "asc" },
                    { id: "asc" },
                ],
                select: {
                    id: true,
                    status: true,
                    message: true,
                    createdAt: true,
                },
            },
        },
    });
    if (!order) {
        throw new Error("Commande introuvable");
    }
    return order;
}
