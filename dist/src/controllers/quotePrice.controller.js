"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceQuoteController = priceQuoteController;
const zod_1 = require("zod");
const quotePreviewTicket_1 = require("../services/quotePreviewTicket");
const ticketPricing_1 = require("../services/ticketPricing");
const appError_1 = require("../utils/appError");
const bodySchema = zod_1.z
    .object({
    ticket: zod_1.z.string().min(1).max(12000),
    variantSku: zod_1.z.string().min(1).max(100).optional(),
    quantity: zod_1.z.number().int().min(1).max(999).default(1),
})
    .strict();
async function priceQuoteController(req, res) {
    try {
        const body = bodySchema.parse(req.body);
        const ticket = (0, quotePreviewTicket_1.verifyQuotePreviewTicket)(body.ticket);
        const b = (0, ticketPricing_1.priceTicketSelection)(ticket, { variantSku: body.variantSku, quantity: body.quantity });
        return res.json({
            success: true,
            data: {
                currency: "USD",
                quantity: body.quantity,
                productPrice: b.productPrice.toString(),
                shippingCost: b.shippingCost.toString(),
                customsCost: b.customsCost.toString(),
                commissionCost: b.commissionCost.toString(),
                fixedFee: b.fixedFee.toString(),
                totalPrice: b.totalPrice.toString(),
                isProvisional: b.isProvisional,
            },
        });
    }
    catch (error) {
        return res.status(400).json({ success: false, message: (0, appError_1.safeMessage)(error) });
    }
}
