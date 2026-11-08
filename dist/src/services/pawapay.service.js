"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentUserError = void 0;
exports.createDeposit = createDeposit;
const env_1 = require("../config/env");
/** Erreur dont le message peut être montré tel quel au client (saisie invalide, paiement refusé). */
class PaymentUserError extends Error {
}
exports.PaymentUserError = PaymentUserError;
function normalizePhone(phone) {
    return phone
        .replace(/\D/g, "") // enlève espaces, +, tirets...
        .replace(/^0/, "243"); // remplace le 0 initial par indicatif RDC
}
function normalizeProvider(provider) {
    const providers = {
        AIRTEL: "AIRTEL_COD",
        MTN: "MTN_MOMO_COD",
        ORANGE: "ORANGE_COD",
        VODACOM: "VODACOM_MPESA"
    };
    const normalized = providers[provider.toUpperCase()];
    if (!normalized) {
        throw new PaymentUserError("Provider Mobile Money non supporté");
    }
    return normalized;
}
async function createDeposit(data) {
    const payload = {
        depositId: data.depositId,
        amount: data.amount,
        currency: data.currency,
        payer: {
            type: "MMO",
            accountDetails: {
                phoneNumber: normalizePhone(data.phoneNumber),
                provider: normalizeProvider(data.provider)
            }
        },
        customerMessage: (data.customerMessage ?? "Paiement AT Market")
            .replace(/[^a-zA-Z0-9 ]/g, ""),
        metadata: [
            {
                orderId: data.orderId
            }
        ]
    };
    try {
        const response = await fetch(`${env_1.env.PAWAPAY_BASE_URL}/v2/deposits`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env_1.env.PAWAPAY_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`PawaPay HTTP ${response.status}`);
        }
        const result = JSON.parse(responseText);
        return result;
    }
    catch (error) {
        console.error("PAWAPAY ERROR:", error?.message);
        throw new Error(error.message ??
            "Erreur communication PawaPay");
    }
}
