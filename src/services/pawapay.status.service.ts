import { env } from "../config/env";

// Forme de la réponse de GET /v2/deposits/{depositId} (API PawaPay v2)
export interface PawapayDepositStatus {
  status: string; // "FOUND" | "NOT_FOUND" | "REJECTED"
  data?: {
    depositId?: string;
    status?: string; // COMPLETED | FAILED | ACCEPTED | PROCESSING | IN_RECONCILIATION
    amount?: string;
    currency?: string;
  };
}

/**
 * Interroge PawaPay directement, avec NOTRE clé d'API.
 * C'est la seule source de vérité pour savoir si un dépôt est payé.
 */
export async function getDepositStatus(
  depositId: string
): Promise<PawapayDepositStatus> {
  const response = await fetch(
    `${env.PAWAPAY_BASE_URL}/v2/deposits/${encodeURIComponent(depositId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.PAWAPAY_API_KEY}`,
      },
      signal: AbortSignal.timeout(10_000),
    }
  );

  // On ne journalise pas le corps de la réponse : il contient des données du payeur.
  if (!response.ok) {
    throw new Error(`PawaPay status error: HTTP ${response.status}`);
  }

  return (await response.json()) as PawapayDepositStatus;
}