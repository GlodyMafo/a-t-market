"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pawapayCallbackController = pawapayCallbackController;
const zod_1 = require("zod");
const pawapay_callback_service_1 = require("../services/pawapay.callback.service");
const pawapay_validator_1 = require("../validators/pawapay.validator");
async function pawapayCallbackController(req, res) {
    try {
        const payload = pawapay_validator_1.pawapayWebhookSchema.parse(req.body);
        await (0, pawapay_callback_service_1.handlePawapayCallback)(payload);
        // Réponse volontairement minimale : aucune donnée de paiement n'est renvoyée.
        // 200 même si le dépôt est inconnu, pour que PawaPay ne réessaie pas indéfiniment.
        return res.status(200).json({ success: true });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
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
