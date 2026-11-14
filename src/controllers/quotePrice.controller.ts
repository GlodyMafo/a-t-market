import type { Request, Response } from "express";
import { z } from "zod";
import { verifyQuotePreviewTicket } from "../services/quotePreviewTicket";
import { priceTicketSelection } from "../services/ticketPricing";
import { safeMessage } from "../utils/appError";

const bodySchema = z
  .object({
    ticket: z.string().min(1).max(12000),
    variantSku: z.string().min(1).max(100).optional(),
    quantity: z.number().int().min(1).max(999).default(1),
  })
  .strict();

export async function priceQuoteController(req: Request, res: Response) {
  try {
    const body = bodySchema.parse(req.body);
    const ticket = verifyQuotePreviewTicket(body.ticket);
    const b = priceTicketSelection(ticket, { variantSku: body.variantSku, quantity: body.quantity });
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
  } catch (error) {
    return res.status(400).json({ success: false, message: safeMessage(error) });
  }
}