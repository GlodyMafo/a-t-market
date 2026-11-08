"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAdminAlert = buildAdminAlert;
exports.notifyAdmin = notifyAdmin;
const env_1 = require("../config/env");
const email_templates_1 = require("./email/email.templates");
const mailer_service_1 = require("./email/mailer.service");
const notification_service_1 = require("./notification.service");
const money = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(2)} $` : "—";
};
function dataOf(note) {
    const d = note.data;
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
}
/** Construit l'alerte d'un événement, ou null s'il n'en mérite pas (ex. changement de suivi). */
function buildAdminAlert(note) {
    if (!note.orderId)
        return null;
    const ref = (0, notification_service_1.orderRef)(note.orderId);
    const d = dataOf(note);
    switch (note.type) {
        case "ORDER_CREATED":
            return {
                subject: `Nouvelle commande ${ref}`,
                title: `Nouvelle commande ${ref}`,
                lines: [`Montant total : ${money(d.totalAmount)}`],
            };
        case "PAYMENT_CONFIRMED": {
            const complet = d.orderStatus === "PAID";
            return {
                subject: complet ? `Paiement complet ${ref}` : `Paiement partiel ${ref}`,
                title: complet ? `Commande ${ref} entièrement payée` : `Paiement partiel reçu pour ${ref}`,
                lines: [
                    `Montant reçu : ${money(d.paidAmount)}`,
                    ...(complet ? [] : [`Reste à payer : ${money(d.remainingAmount)}`]),
                ],
            };
        }
        case "PAYMENT_FAILED":
            return {
                subject: `Paiement échoué ${ref}`,
                title: `Paiement échoué pour ${ref}`,
                lines: [`Montant : ${money(d.amount)}`],
            };
        case "ORDER_CANCELLED":
            return {
                subject: `Commande annulée ${ref}`,
                title: `Commande ${ref} annulée`,
                lines: ["Annulation automatique : paiement non reçu dans le délai prévu."],
            };
        default:
            return null;
    }
}
function renderHtml(title, lines, when) {
    const items = lines
        .map((l) => `<p style="margin:0 0 8px;font-size:15px;color:#1F2A44;">${(0, email_templates_1.escapeHtml)(l)}</p>`)
        .join("");
    return (`<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#EEF2F9;font-family:Arial,Helvetica,sans-serif;">` +
        `<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE4F2;border-radius:8px;padding:24px;">` +
        `<h1 style="margin:0 0 16px;font-size:18px;color:#2C4C8A;">${(0, email_templates_1.escapeHtml)(title)}</h1>` +
        items +
        `<p style="margin:16px 0 0;font-size:12px;color:#6B7280;">${(0, email_templates_1.escapeHtml)((0, email_templates_1.formatEmailDate)(when))}</p>` +
        `</div></body></html>`);
}
/**
 * Envoie l'alerte administrateur correspondant à la notification.
 * La promesse retournée ne rejette jamais ; en production, l'appelant ne l'attend pas (`void`).
 */
async function notifyAdmin(note) {
    const to = env_1.env.ADMIN_NOTIFICATION_EMAIL;
    if (!to)
        return;
    try {
        const alert = buildAdminAlert(note);
        if (!alert)
            return;
        const result = await (0, mailer_service_1.sendEmail)({
            to,
            subject: `[A&T Market] ${alert.subject}`,
            text: [alert.title, "", ...alert.lines, "", (0, email_templates_1.formatEmailDate)(note.createdAt)].join("\n"),
            html: renderHtml(alert.title, alert.lines, note.createdAt),
        });
        if (!result.ok) {
            console.error(`ALERTE ADMIN : envoi impossible vers ${(0, mailer_service_1.maskEmail)(to)} : ${result.error}`);
        }
    }
    catch (error) {
        console.error("ALERTE ADMIN : erreur inattendue :", error instanceof Error ? error.message : "Erreur inconnue");
    }
}
