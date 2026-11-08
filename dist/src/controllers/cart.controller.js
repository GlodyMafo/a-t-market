"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToCartController = addToCartController;
exports.getCartController = getCartController;
exports.updateCartItemController = updateCartItemController;
exports.removeCartItemController = removeCartItemController;
exports.addQuoteToCartController = addQuoteToCartController;
exports.mergeCartController = mergeCartController;
const appError_1 = require("../utils/appError");
const cart_service_1 = require("../services/cart.service");
async function addToCartController(req, res) {
    try {
        const cartItem = await (0, cart_service_1.addToCart)({
            userId: req.user.userId,
            productId: req.body.productId,
            quantity: req.body.quantity
        });
        return res.status(201).json({
            success: true,
            data: cartItem
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
// Get cart by user
async function getCartController(req, res) {
    try {
        const cart = await (0, cart_service_1.getCartByUser)(req.user.userId);
        return res.json({
            success: true,
            data: cart
        });
    }
    catch (error) {
        return res.status(404).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
// Update quantity
async function updateCartItemController(req, res) {
    try {
        const { id } = req.params;
        const { quantity } = req.body;
        const item = await (0, cart_service_1.updateCartItemQuantity)(id, quantity, req.user.userId);
        return res.json({
            success: true,
            data: item
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
//Delete cart 
async function removeCartItemController(req, res) {
    try {
        const { id } = req.params;
        const result = await (0, cart_service_1.removeCartItem)(id, req.user.userId);
        return res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
// Ajouter un devis international (le sien) au panier
async function addQuoteToCartController(req, res) {
    try {
        const result = await (0, cart_service_1.addQuoteToCart)(req.user.userId, (req.body ?? {}).quoteId, (req.body ?? {}).quantity);
        return res.status(result.status === "ADDED" ? 201 : 200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error),
        });
    }
}
// Fusionner le panier invité avec le panier du compte (après connexion)
async function mergeCartController(req, res) {
    try {
        const result = await (0, cart_service_1.mergeGuestCart)(req.user.userId, req.body ?? {});
        return res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        if (error instanceof cart_service_1.MergeInputError) {
            return res.status(400).json({ success: false, message: (0, appError_1.safeMessage)(error) });
        }
        // Deux fusions simultanées avec le même ticket : la seconde échoue sur l'unicité.
        if (error?.code === "P2002") {
            return res.status(409).json({
                success: false,
                message: "Conflit pendant la fusion : réessayez.",
            });
        }
        console.error("[CART MERGE] Erreur :", error);
        return res.status(500).json({
            success: false,
            message: "Impossible de fusionner le panier pour le moment.",
        });
    }
}
