"use strict";
/**
 * Modèles d'e-mails A&T Market (français, HTML + texte brut).
 *
 * Fichier « pur » : aucune base de données, aucune configuration.
 * Chaque événement n'accepte que les champs prévus (liste blanche) :
 * rien d'autre ne peut se retrouver dans un e-mail.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_TRACKING_STATUSES = void 0;
exports.isEmailTrackingStatus = isEmailTrackingStatus;
exports.escapeHtml = escapeHtml;
exports.formatEmailDate = formatEmailDate;
exports.renderEmail = renderEmail;
const email_logo_1 = require("./email.logo");
exports.EMAIL_TRACKING_STATUSES = [
    "PURCHASED",
    "PREPARING",
    "IN_TRANSIT",
    "ARRIVED_DRC",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
];
/** Vrai pour les statuts de suivi qui déclenchent un e-mail (les autres restent des notifications internes). */
function isEmailTrackingStatus(status) {
    return exports.EMAIL_TRACKING_STATUSES.includes(status);
}
const BRAND = "A&T Market";
const TIME_ZONE = "Africa/Lubumbashi";
// ---------- Identité visuelle (couleurs du logo) ----------
const COLOR = {
    brand: "#3D64AF", // bleu du logo
    brandDark: "#2C4C8A",
    ink: "#1F2A44",
    muted: "#6B7280",
    page: "#EEF2F9",
    panel: "#F5F8FD",
    border: "#DCE4F2",
    white: "#FFFFFF",
};
const TONES = {
    info: { bg: "#E4ECF9", fg: "#2C4C8A" },
    success: { bg: "#DFF3E7", fg: "#1E6B3C" },
    warning: { bg: "#FDF0D5", fg: "#855400" },
    danger: { bg: "#FCE4E4", fg: "#A12626" },
};
const FONT = "Arial,Helvetica,sans-serif";
// ---------- Utilitaires ----------
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/** Date en français, à l'heure de Lubumbashi. Ex. : « 2 novembre 2026 à 12:30 ». */
function formatEmailDate(date) {
    return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: TIME_ZONE,
    }).format(date);
}
const money = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(2)} $` : "—";
};
/** Origine du site si l'URL est http(s) valide, sinon null (jamais de chemin, jamais de javascript:). */
function safeSiteUrl(raw) {
    if (!raw)
        return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== "https:" && url.protocol !== "http:")
            return null;
        return url.origin;
    }
    catch {
        return null;
    }
}
const TRACKING_CONTENT = {
    PURCHASED: {
        subject: "produit acheté",
        title: "Votre produit a été acheté",
        status: "Produit acheté",
        body: "Nous avons acheté votre produit auprès du vendeur.",
        tone: "info",
    },
    PREPARING: {
        subject: "en préparation",
        title: "Votre commande est en préparation",
        status: "En préparation",
        body: "Notre équipe prépare actuellement votre commande.",
        tone: "info",
    },
    IN_TRANSIT: {
        subject: "en transit",
        title: "Votre commande est en transit",
        status: "En transit",
        body: "Votre commande est en route vers la RDC.",
        tone: "info",
    },
    ARRIVED_DRC: {
        subject: "arrivée en RDC",
        title: "Votre commande est arrivée en RDC",
        status: "Arrivée en RDC",
        body: "Bonne nouvelle : votre commande est arrivée en RDC.",
        tone: "info",
    },
    OUT_FOR_DELIVERY: {
        subject: "en cours de livraison",
        title: "Votre commande est en cours de livraison",
        status: "En cours de livraison",
        body: "Votre commande est en cours de livraison.",
        tone: "info",
    },
    DELIVERED: {
        subject: "livrée",
        title: "Votre commande a été livrée",
        status: "Livrée",
        body: "Votre commande a été livrée. Merci de votre confiance !",
        tone: "success",
    },
};
function describe(event, ref) {
    switch (event.kind) {
        case "ORDER_CREATED": {
            const paragraphs = [
                `Nous avons bien enregistré votre commande ${ref}, d'un montant total de ${money(event.totalAmount)}.`,
                "Elle sera validée dès la réception de votre paiement.",
            ];
            const minutes = event.reservationMinutes;
            if (minutes && minutes > 0) {
                paragraphs.push(`Sans paiement, elle sera annulée automatiquement au bout de ${minutes} minute${minutes > 1 ? "s" : ""}.`);
            }
            return {
                subject: `commande ${ref} enregistrée`,
                title: "Votre commande est enregistrée",
                status: "En attente de paiement",
                tone: "info",
                paragraphs,
            };
        }
        case "PAYMENT_CONFIRMED":
            if (event.orderFullyPaid) {
                return {
                    subject: `paiement reçu, commande ${ref} validée`,
                    title: "Paiement confirmé",
                    status: "Paiement confirmé, commande validée",
                    tone: "success",
                    paragraphs: [
                        `Nous avons bien reçu votre paiement de ${money(event.paidAmount)}.`,
                        `Votre commande ${ref} est validée.`,
                    ],
                };
            }
            return {
                subject: `paiement reçu pour la commande ${ref}`,
                title: "Paiement partiel confirmé",
                status: "Paiement partiel confirmé",
                tone: "warning",
                paragraphs: [
                    `Nous avons bien reçu votre paiement de ${money(event.paidAmount)} pour la commande ${ref}.`,
                    `Il reste ${money(event.remainingAmount)} à payer pour valider votre commande.`,
                ],
            };
        case "PAYMENT_FAILED":
            return {
                subject: `paiement non abouti pour la commande ${ref}`,
                title: "Votre paiement n'a pas abouti",
                status: "Paiement échoué",
                tone: "danger",
                paragraphs: [
                    `Votre paiement de ${money(event.amount)} pour la commande ${ref} n'a pas abouti.`,
                    "Vous pouvez réessayer depuis votre compte.",
                ],
            };
        case "TRACKING": {
            const c = TRACKING_CONTENT[event.status];
            const paragraphs = [c.body];
            const message = event.message?.replace(/\r/g, "").trim();
            if (message)
                paragraphs.push(`Information de notre équipe : ${message}`);
            return {
                subject: `commande ${ref} : ${c.subject}`,
                title: c.title,
                status: c.status,
                tone: c.tone,
                paragraphs,
            };
        }
        case "ORDER_CANCELLED":
            return {
                subject: `commande ${ref} annulée`,
                title: "Votre commande a été annulée",
                status: "Commande annulée",
                tone: "danger",
                paragraphs: [
                    `Votre commande ${ref} n'a pas été payée dans le délai imparti : elle a été annulée automatiquement.`,
                    "Si vous souhaitez toujours ces articles, vous pouvez passer une nouvelle commande depuis votre compte.",
                ],
            };
        default: {
            const jamais = event;
            throw new Error(`Événement d'e-mail inconnu : ${JSON.stringify(jamais)}`);
        }
    }
}
// ---------- Assemblage ----------
function renderEmail(event, ctx) {
    const section = describe(event, ctx.orderRef);
    const date = formatEmailDate(ctx.occurredAt);
    const site = safeSiteUrl(ctx.frontendUrl);
    const subject = `${BRAND} : ${section.subject}`.replace(/[\r\n]+/g, " ");
    const tone = TONES[section.tone];
    const details = [
        ["Commande", ctx.orderRef],
        ["Statut", section.status],
        ["Date", date],
    ];
    const accountLine = site
        ? `Consultez votre compte : ${site}`
        : `Consultez votre compte sur la plateforme ${BRAND} pour suivre votre commande.`;
    const footer = "Cet e-mail est envoyé automatiquement, merci de ne pas y répondre.";
    // ----- Texte brut -----
    const text = [
        BRAND,
        "",
        "Bonjour,",
        "",
        section.title,
        "",
        ...section.paragraphs.flatMap((p) => [p, ""]),
        ...details.map(([label, value]) => `${label} : ${value}`),
        "",
        accountLine,
        "",
        footer,
    ].join("\n");
    // ----- HTML (tableaux + styles en ligne : compatible Gmail, Outlook, mobiles) -----
    const paragraphsHtml = section.paragraphs
        .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLOR.ink};">${escapeHtml(p)}</p>`)
        .join("\n");
    const detailsHtml = details
        .map(([label, value], i) => `<tr>` +
        `<td style="padding:10px 16px;${i > 0 ? `border-top:1px solid ${COLOR.border};` : ""}font-size:13px;color:${COLOR.muted};white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td align="right" style="padding:10px 16px;${i > 0 ? `border-top:1px solid ${COLOR.border};` : ""}font-size:14px;font-weight:bold;color:${COLOR.ink};">${escapeHtml(value)}</td>` +
        `</tr>`)
        .join("\n");
    const accountHtml = site
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 0;">
<tr><td bgcolor="${COLOR.brand}" style="background:${COLOR.brand};border-radius:8px;">
<a href="${escapeHtml(site)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:bold;color:${COLOR.white};text-decoration:none;">Consulter mon compte</a>
</td></tr>
</table>`
        : `<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:${COLOR.muted};">${escapeHtml(accountLine)}</p>`;
    const preheader = escapeHtml(section.paragraphs[0] ?? section.title);
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.page};font-family:${FONT};color:${COLOR.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.page};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLOR.page}" style="background:${COLOR.page};padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${COLOR.white};border-radius:12px;overflow:hidden;border:1px solid ${COLOR.border};">
<tr><td bgcolor="${COLOR.brand}" style="background:${COLOR.brand};height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:22px 32px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:12px;vertical-align:middle;"><img src="cid:${email_logo_1.LOGO_CID}" width="48" height="48" alt="${escapeHtml(BRAND)}" style="display:block;border:0;border-radius:10px;"></td>
<td style="vertical-align:middle;font-family:${FONT};font-size:22px;font-weight:bold;color:${COLOR.brand};letter-spacing:0.3px;">${escapeHtml(BRAND)}</td>
</tr></table>
</td></tr>
<tr><td style="padding:0 32px 8px;">
<p style="margin:0 0 18px;font-size:15px;color:${COLOR.ink};">Bonjour,</p>
<span style="display:inline-block;background:${tone.bg};color:${tone.fg};font-size:12px;font-weight:bold;letter-spacing:0.4px;text-transform:uppercase;padding:6px 12px;border-radius:999px;">${escapeHtml(section.status)}</span>
<h1 style="margin:16px 0 16px;font-size:24px;line-height:1.3;color:${COLOR.ink};">${escapeHtml(section.title)}</h1>
${paragraphsHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLOR.panel}" style="margin:20px 0 0;background:${COLOR.panel};border:1px solid ${COLOR.border};border-radius:10px;">
${detailsHtml}
</table>
${accountHtml}
</td></tr>
<tr><td style="padding:28px 32px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLOR.border};">
<tr><td style="padding-top:16px;font-size:12px;line-height:1.6;color:${COLOR.muted};"><strong style="color:${COLOR.brand};">${escapeHtml(BRAND)}</strong><br>${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
    return { subject, text, html, inlineImages: [(0, email_logo_1.logoInlineImage)()] };
}
