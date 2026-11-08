import type { TrackingStatus } from "../../generated/prisma/client";

/**
 * Cycle de vie logistique d'une commande (cahier des charges 4.10 et 4.11).
 * Fichier « pur » : aucune base de données, facile à tester.
 *
 * - LOCAL         : payé -> préparation -> livraison -> livré
 * - INTERNATIONAL : payé -> achat -> en Chine -> en transit -> RDC -> livré
 * - MIXED         : suit le parcours international (tout est livré en une fois)
 *
 * Le stock local est déjà réservé à la création de la commande : l'étape
 * « stock réservé » du cahier des charges est donc couverte avant le paiement.
 */

export type OrderKind = "LOCAL" | "INTERNATIONAL" | "MIXED";

export const TRACKING_STATUSES = [
  "ORDER_VALIDATED",
  "PURCHASED",
  "PREPARING",
  "IN_CHINA",
  "IN_TRANSIT",
  "ARRIVED_DRC",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const satisfies readonly TrackingStatus[];

export const TRACKING_LABELS: Record<TrackingStatus, string> = {
  ORDER_VALIDATED: "Commande validée",
  PURCHASED: "Produit acheté",
  PREPARING: "En préparation",
  IN_CHINA: "En Chine",
  IN_TRANSIT: "En transit",
  ARRIVED_DRC: "Arrivé en RDC",
  OUT_FOR_DELIVERY: "En cours de livraison",
  DELIVERED: "Livré",
};

type Flow = Partial<Record<TrackingStatus, readonly TrackingStatus[]>>;

const LOCAL_FLOW: Flow = {
  ORDER_VALIDATED: ["PREPARING"],
  PREPARING: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
};

const INTERNATIONAL_FLOW: Flow = {
  ORDER_VALIDATED: ["PURCHASED"],
  PURCHASED: ["IN_CHINA"],
  IN_CHINA: ["IN_TRANSIT"],
  IN_TRANSIT: ["ARRIVED_DRC"],
  // La livraison à domicile est facultative : on peut passer direct à « Livré ».
  ARRIVED_DRC: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
};

const FLOWS: Record<OrderKind, Flow> = {
  LOCAL: LOCAL_FLOW,
  INTERNATIONAL: INTERNATIONAL_FLOW,
  MIXED: INTERNATIONAL_FLOW,
};

/** Un article avec un devis = article international. */
export function getOrderKind(items: { quoteId: string | null }[]): OrderKind {
  const international = items.filter((i) => i.quoteId !== null).length;
  if (international === 0) return "LOCAL";
  return international === items.length ? "INTERNATIONAL" : "MIXED";
}

/** Statuts que l'admin peut poster maintenant. current = null : aucun événement encore. */
export function allowedNextStatuses(
  kind: OrderKind,
  current: TrackingStatus | null
): TrackingStatus[] {
  if (current === null) return ["ORDER_VALIDATED"];
  return [...(FLOWS[kind][current] ?? [])];
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: TrackingStatus | null,
    public readonly to: TrackingStatus,
    public readonly allowed: TrackingStatus[]
  ) {
    const fromLabel = from ? `« ${TRACKING_LABELS[from]} »` : "aucun statut";
    const hint =
      allowed.length > 0
        ? `Statut(s) possible(s) : ${allowed.map((s) => `« ${TRACKING_LABELS[s]} »`).join(", ")}.`
        : "Cette commande est terminée, plus aucun changement n'est possible.";
    super(`Transition impossible : de ${fromLabel} vers « ${TRACKING_LABELS[to]} ». ${hint}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(
  kind: OrderKind,
  current: TrackingStatus | null,
  next: TrackingStatus
) {
  const allowed = allowedNextStatuses(kind, current);
  if (!allowed.includes(next)) {
    throw new InvalidTransitionError(current, next, allowed);
  }
}