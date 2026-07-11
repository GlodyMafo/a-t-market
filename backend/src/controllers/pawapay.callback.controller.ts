import { Request, Response } from "express";
import { ZodError } from "zod";

import { handlePawapayCallback } from "../services/pawapay.callback.service";
import { pawapayWebhookSchema } from "../validators/pawapay.validator";

export async function pawapayCallbackController(
  req: Request,
  res: Response
) {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Empty webhook payload",
      });
    }

    console.log("===== PAWAPAY CALLBACK =====");
    console.log(req.body);

    const validatedData = pawapayWebhookSchema.parse(req.body);

    const payment = await handlePawapayCallback(validatedData);

    return res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error: any) {
    if (error instanceof ZodError) {
      console.error("Webhook validation failed:", error.flatten());

      return res.status(400).json({
        success: false,
        message: "Invalid webhook payload",
        errors: error.flatten(),
      });
    }

    console.error("PAWAPAY CALLBACK ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message ?? "Webhook processing failed",
    });
  }
}