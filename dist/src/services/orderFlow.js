"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidTransitionError = exports.TRACKING_LABELS = exports.TRACKING_STATUSES = void 0;
exports.getOrderKind = getOrderKind;
exports.allowedNextStatuses = allowedNextStatuses;
exports.assertTransition = assertTransition;
exports.TRACKING_STATUSES = [
    "ORDER_VALIDATED",
    "PURCHASED",
    "PREPARING",
    "IN_CHINA",
    "IN_TRANSIT",
    "ARRIVED_DRC",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
];
exports.TRACKING_LABELS = {
    ORDER_VALIDATED: "Commande validée",
    PURCHASED: "Produit acheté",
    PREPARING: "En préparation",
    IN_CHINA: "En Chine",
    IN_TRANSIT: "En transit",
    ARRIVED_DRC: "Arrivé en RDC",
    OUT_FOR_DELIVERY: "En cours de livraison",
    DELIVERED: "Livré",
};
const LOCAL_FLOW = {
    ORDER_VALIDATED: ["PREPARING"],
    PREPARING: ["OUT_FOR_DELIVERY"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
};
const INTERNATIONAL_FLOW = {
    ORDER_VALIDATED: ["PURCHASED"],
    PURCHASED: ["IN_CHINA"],
    IN_CHINA: ["IN_TRANSIT"],
    IN_TRANSIT: ["ARRIVED_DRC"],
    // La livraison à domicile est facultative : on peut passer direct à « Livré ».
    ARRIVED_DRC: ["OUT_FOR_DELIVERY", "DELIVERED"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
};
const FLOWS = {
    LOCAL: LOCAL_FLOW,
    INTERNATIONAL: INTERNATIONAL_FLOW,
    MIXED: INTERNATIONAL_FLOW,
};
/** Un article avec un devis = article international. */
function getOrderKind(items) {
    const international = items.filter((i) => i.quoteId !== null).length;
    if (international === 0)
        return "LOCAL";
    return international === items.length ? "INTERNATIONAL" : "MIXED";
}
/** Statuts que l'admin peut poster maintenant. current = null : aucun événement encore. */
function allowedNextStatuses(kind, current) {
    if (current === null)
        return ["ORDER_VALIDATED"];
    return [...(FLOWS[kind][current] ?? [])];
}
class InvalidTransitionError extends Error {
    from;
    to;
    allowed;
    constructor(from, to, allowed) {
        const fromLabel = from ? `« ${exports.TRACKING_LABELS[from]} »` : "aucun statut";
        const hint = allowed.length > 0
            ? `Statut(s) possible(s) : ${allowed.map((s) => `« ${exports.TRACKING_LABELS[s]} »`).join(", ")}.`
            : "Cette commande est terminée, plus aucun changement n'est possible.";
        super(`Transition impossible : de ${fromLabel} vers « ${exports.TRACKING_LABELS[to]} ». ${hint}`);
        this.from = from;
        this.to = to;
        this.allowed = allowed;
        this.name = "InvalidTransitionError";
    }
}
exports.InvalidTransitionError = InvalidTransitionError;
function assertTransition(kind, current, next) {
    const allowed = allowedNextStatuses(kind, current);
    if (!allowed.includes(next)) {
        throw new InvalidTransitionError(current, next, allowed);
    }
}
