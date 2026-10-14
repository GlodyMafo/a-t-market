import { Request, Response } from "express";
import { ZodError } from "zod";

import { handlePawapayCallback } from "../services/pawapay.callback.service";
import { pawapayWebhookSchema } from "../validators/pawapay.validator";

export async function pawapayCallbackController(req: Request, res: Response) {
  try {
    const payload = pawapayWebhookSchema.parse(req.body);

    await handlePawapayCallback(payload);

    // Réponse volontairement minimale : aucune donnée de paiement n'est renvoyée.
    // 200 même si le dépôt est inconnu, pour que PawaPay ne réessaie pas indéfiniment.
    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook payload",
      });
    }

    // Erreur côté serveur (base, réseau vers PawaPay) : 500 pour que PawaPay réessaie.
    console.error("PAWAPAY CALLBACK ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
}