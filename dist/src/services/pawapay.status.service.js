"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDepositStatus = getDepositStatus;
const env_1 = require("../config/env");
/**
 * Interroge PawaPay directement, avec NOTRE clé d'API.
 * C'est la seule source de vérité pour savoir si un dépôt est payé.
 */
async function getDepositStatus(depositId) {
    const response = await fetch(`${env_1.env.PAWAPAY_BASE_URL}/v2/deposits/${encodeURIComponent(depositId)}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${env_1.env.PAWAPAY_API_KEY}`,
        },
        signal: AbortSignal.timeout(10_000),
    });
    // On ne journalise pas le corps de la réponse : il contient des données du payeur.
    if (!response.ok) {
        throw new Error(`PawaPay status error: HTTP ${response.status}`);
    }
    return (await response.json());
}
