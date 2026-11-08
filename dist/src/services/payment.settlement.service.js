"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_CURRENCY = void 0;
exports.settlePaymentByDepositId = settlePaymentByDepositId;
const prisma_1 = require("../lib/prisma");
const pawapay_status_service_1 = require("./pawapay.status.service");
const notification_service_1 = require("./notification.service");
const admin_email_service_1 = require("./admin.email.service");
/** Devise utilisée pour tous les paiements (sandbox validé en USD). */
exports.PAYMENT_CURRENCY = "USD";
// Les montants sont comparés en centimes pour éviter les erreurs d'arrondi flottant.
const toCents = (value) => Math.round(Number(value) * 100);
/**
 * Seul et unique point d'entrée pour faire passer un paiement à PAID ou FAILED.
 * Appelé par le callback PawaPay ET par la réconciliation.
 *
 * Principe : on ne croit JAMAIS le contenu d'un callback. On redemande à PawaPay
 * l'état réel du dépôt, puis on vérifie montant, devise et identifiant.
 */
async function settlePaymentByDepositId(depositId, fetchStatus = pawapay_status_service_1.getDepositStatus) {
    const payment = await prisma_1.prisma.payment.findFirst({
        where: { providerReference: depositId },
    });
    if (!payment) {
        return { outcome: "UNKNOWN_PAYMENT" };
    }
    if (payment.status === "PAID" || payment.status === "REFUNDED") {
        return { outcome: "ALREADY_FINAL", paymentId: payment.id };
    }
    // Peut lever une erreur (réseau, HTTP) : l'appelant décide quoi faire.
    const remote = await fetchStatus(depositId);
    if (remote.status !== "FOUND" || !remote.data) {
        return {
            outcome: "STILL_PENDING",
            paymentId: payment.id,
            reason: `PawaPay a répondu ${remote.status}`,
        };
    }
    const remoteStatus = remote.data.status;
    // --- Échec confirmé par PawaPay ---
    if (remoteStatus === "FAILED") {
        // Le client est prévenu une seule fois : seul l'appel qui fait réellement passer le paiement à FAILED notifie.
        const note = await prisma_1.prisma.$transaction(async (tx) => {
            const failed = await tx.payment.updateMany({
                where: { id: payment.id, status: "PENDING" },
                data: { status: "FAILED" },
            });
            if (failed.count === 0)
                return null;
            const order = await tx.order.findUnique({
                where: { id: payment.orderId },
                select: { userId: true },
            });
            if (!order)
                return null;
            return (0, notification_service_1.recordNotification)(tx, {
                userId: order.userId,
                type: "PAYMENT_FAILED",
                orderId: payment.orderId,
                title: "Paiement échoué",
                message: `Votre paiement de ${(0, notification_service_1.formatUsd)(payment.amount)} pour la commande ${(0, notification_service_1.orderRef)(payment.orderId)} n'a pas abouti. Vous pouvez réessayer.`,
                emailWanted: true,
                data: {
                    paymentId: payment.id,
                    amount: payment.amount.toString(),
                },
            });
        });
        if (note) {
            (0, notification_service_1.publishNotification)(note);
            void (0, admin_email_service_1.notifyAdmin)(note);
        }
        return { outcome: "FAILED", paymentId: payment.id };
    }
    // --- Tout statut non final (ACCEPTED, PROCESSING, IN_RECONCILIATION) : on attend ---
    if (remoteStatus !== "COMPLETED") {
        return {
            outcome: "STILL_PENDING",
            paymentId: payment.id,
            reason: `Statut PawaPay : ${remoteStatus}`,
        };
    }
    // --- COMPLETED : vérifications strictes avant de créditer ---
    const reasons = [];
    if (remote.data.depositId && remote.data.depositId !== depositId) {
        reasons.push("depositId différent");
    }
    if (remote.data.currency !== exports.PAYMENT_CURRENCY) {
        reasons.push(`devise inattendue (${remote.data.currency})`);
    }
    if (remote.data.amount === undefined ||
        toCents(remote.data.amount) !== toCents(payment.amount.toString())) {
        reasons.push(`montant inattendu (reçu ${remote.data.amount}, attendu ${payment.amount.toString()})`);
    }
    if (reasons.length > 0) {
        // Le paiement reste PENDING : un humain doit regarder (de l'argent a peut-être été reçu).
        console.error(`ALERTE PAIEMENT : dépôt ${depositId} COMPLETED chez PawaPay mais refusé : ${reasons.join(", ")}`);
        return {
            outcome: "VERIFICATION_FAILED",
            paymentId: payment.id,
            reason: reasons.join(", "),
        };
    }
    // --- Transaction atomique ---
    const settled = await prisma_1.prisma.$transaction(async (tx) => {
        const notes = [];
        // On verrouille la commande : deux paiements de la même commande
        // réglés en même temps passent l'un après l'autre.
        await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${payment.orderId} FOR UPDATE`;
        // Mise à jour conditionnelle : un seul appel "gagne" la transition vers PAID.
        const won = await tx.payment.updateMany({
            where: { id: payment.id, status: { notIn: ["PAID", "REFUNDED"] } },
            data: { status: "PAID" },
        });
        if (won.count === 0) {
            return { outcome: "ALREADY_FINAL", notes };
        }
        const order = await tx.order.findUnique({
            where: { id: payment.orderId },
            select: { status: true, totalAmount: true, userId: true },
        });
        // On ne touche à la commande que si elle attend encore un paiement
        // (jamais une commande annulée ou déjà livrée).
        if (order &&
            (order.status === "PENDING_PAYMENT" || order.status === "PARTIALLY_PAID")) {
            const paidPayments = await tx.payment.findMany({
                where: { orderId: payment.orderId, status: "PAID" },
                select: { amount: true },
            });
            const paidCents = paidPayments.reduce((sum, p) => sum + toCents(p.amount.toString()), 0);
            // PAID seulement si la somme des paiements couvre le total de la commande.
            const newStatus = paidCents >= toCents(order.totalAmount.toString())
                ? "PAID"
                : "PARTIALLY_PAID";
            await tx.order.update({
                where: { id: payment.orderId },
                data: { status: newStatus },
            });
            // Premier événement du suivi, créé une seule fois : on n'arrive ici
            // que lorsque la commande passe réellement à PAID.
            if (newStatus === "PAID") {
                await tx.trackingEvent.create({
                    data: {
                        orderId: payment.orderId,
                        status: "ORDER_VALIDATED",
                        message: "Paiement reçu : commande validée",
                    },
                });
            }
            // Notification du client, écrite dans la même transaction que le paiement.
            const ref = (0, notification_service_1.orderRef)(payment.orderId);
            const restant = Math.max(toCents(order.totalAmount.toString()) - paidCents, 0) / 100;
            notes.push(await (0, notification_service_1.recordNotification)(tx, {
                userId: order.userId,
                type: "PAYMENT_CONFIRMED",
                orderId: payment.orderId,
                title: "Paiement confirmé",
                message: newStatus === "PAID"
                    ? `Votre paiement de ${(0, notification_service_1.formatUsd)(payment.amount)} a été reçu. Votre commande ${ref} est validée.`
                    : `Votre paiement de ${(0, notification_service_1.formatUsd)(payment.amount)} a été reçu pour la commande ${ref}. Il reste ${(0, notification_service_1.formatUsd)(restant)} à payer.`,
                emailWanted: true,
                data: {
                    paymentId: payment.id,
                    orderStatus: newStatus,
                    paidAmount: payment.amount.toString(),
                    remainingAmount: restant.toFixed(2),
                },
            }));
        }
        else {
            console.error(`ALERTE PAIEMENT : paiement ${payment.id} reçu pour une commande au statut ${order?.status}`);
        }
        return { outcome: "PAID", notes };
    });
    // Livraison temps réel APRÈS le commit : si l'envoi échoue, le paiement reste enregistré.
    settled.notes.forEach((n) => {
        (0, notification_service_1.publishNotification)(n);
        void (0, admin_email_service_1.notifyAdmin)(n);
    });
    return { outcome: settled.outcome, paymentId: payment.id };
}
