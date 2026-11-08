"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMailTransport = setMailTransport;
exports.isEmailEnabled = isEmailEnabled;
exports.buildTransportOptions = buildTransportOptions;
exports.maskEmail = maskEmail;
exports.describeMailError = describeMailError;
exports.sendEmail = sendEmail;
exports.initMailer = initMailer;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../../config/env");
const SOCKET_TIMEOUT_MS = 10_000;
const SEND_TIMEOUT_MS = 30_000;
const VERIFY_TIMEOUT_MS = 15_000;
let override = null;
let cached = null;
/** Réservé aux tests : remplace le transport réel. `null` rétablit le comportement normal. */
function setMailTransport(transport) {
    override = transport;
}
function isEmailEnabled() {
    return override !== null || env_1.env.SMTP !== null;
}
/** Options Nodemailer (fonction pure, testable). Le port 587 impose STARTTLS. */
function buildTransportOptions(smtp) {
    return {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        requireTLS: !smtp.secure,
        auth: { user: smtp.user, pass: smtp.password },
        connectionTimeout: SOCKET_TIMEOUT_MS,
        greetingTimeout: SOCKET_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
    };
}
function getTransport() {
    if (override)
        return override;
    if (!env_1.env.SMTP)
        return null;
    if (!cached) {
        const transporter = nodemailer_1.default.createTransport(buildTransportOptions(env_1.env.SMTP));
        cached = {
            send: async (message) => {
                const info = await transporter.sendMail(message);
                return { messageId: info.messageId };
            },
            verify: async () => {
                await transporter.verify();
            },
        };
    }
    return cached;
}
/** « jean.dupont@gmail.com » devient « j***@gmail.com » : pour les journaux. */
function maskEmail(address) {
    const [local, domain] = address.split("@");
    if (!local || !domain)
        return "***";
    return `${local[0]}***@${domain}`;
}
class SendTimeoutError extends Error {
    code = "ESENDTIMEOUT";
    constructor() {
        super("timeout");
    }
}
function withTimeout(promise, ms) {
    let timer;
    const limite = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new SendTimeoutError()), ms);
    });
    return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
}
/**
 * Message d'erreur sûr : construit uniquement à partir du code d'erreur,
 * jamais à partir du texte brut (qui peut contenir des identifiants ou des détails serveur).
 */
function describeMailError(error) {
    const e = error;
    const code = typeof e?.code === "string" ? e.code : undefined;
    const responseCode = typeof e?.responseCode === "number" ? e.responseCode : undefined;
    let base;
    switch (code) {
        case "EAUTH":
            base = "Authentification SMTP refusée (vérifiez l'adresse et le mot de passe d'application)";
            break;
        case "ETIMEDOUT":
        case "ECONNECTION":
        case "ECONNREFUSED":
        case "ESOCKET":
        case "ENOTFOUND":
        case "EDNS":
            base = "Serveur SMTP injoignable";
            break;
        case "ESENDTIMEOUT":
            base = "Délai d'envoi dépassé";
            break;
        case "EENVELOPE":
            base = "Adresse expéditeur ou destinataire refusée";
            break;
        default:
            base = "Échec d'envoi de l'e-mail";
    }
    const detail = [code, responseCode].filter((x) => x !== undefined).join(" ");
    return detail ? `${base} (${detail})` : base;
}
// Une adresse ne doit contenir ni retour à la ligne (injection d'en-têtes) ni espace.
const ADRESSE_VALIDE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
function expediteur() {
    if (env_1.env.SMTP) {
        return {
            name: env_1.env.SMTP.fromName.replace(/[\r\n]+/g, " ").trim(),
            address: env_1.env.SMTP.fromEmail,
        };
    }
    // Uniquement atteint avec un transport de test injecté.
    return { name: "AT-MARKET", address: "test@localhost.invalid" };
}
/** Envoie un e-mail. Ne lève jamais d'exception. */
async function sendEmail(email, options = {}) {
    try {
        const transport = getTransport();
        if (!transport) {
            return { ok: false, error: "E-mail désactivé : aucune configuration SMTP" };
        }
        if (!ADRESSE_VALIDE.test(email.to)) {
            return { ok: false, error: "Adresse destinataire invalide" };
        }
        const info = await withTimeout(transport.send({
            from: expediteur(),
            to: email.to,
            subject: email.subject.replace(/[\r\n]+/g, " "),
            text: email.text,
            html: email.html,
            attachments: email.inlineImages?.map((image) => ({
                filename: image.filename,
                content: image.content,
                cid: image.cid,
                contentType: image.contentType,
                contentDisposition: "inline",
            })),
        }), options.timeoutMs ?? SEND_TIMEOUT_MS);
        return { ok: true, messageId: info?.messageId };
    }
    catch (error) {
        const message = describeMailError(error);
        console.error(`E-MAIL : envoi impossible vers ${maskEmail(email.to)} : ${message}`);
        return { ok: false, error: message };
    }
}
/**
 * À appeler au démarrage. Ne bloque pas et ne lève jamais d'exception :
 * un Gmail indisponible n'empêche pas le serveur de démarrer.
 */
function initMailer() {
    if (!env_1.env.SMTP) {
        console.warn("E-MAIL désactivé : aucune configuration SMTP (voir .env.example).");
        return;
    }
    const smtp = env_1.env.SMTP;
    const transport = getTransport();
    if (!transport?.verify)
        return;
    withTimeout(transport.verify(), VERIFY_TIMEOUT_MS)
        .then(() => console.log(`E-MAIL prêt : ${smtp.host}:${smtp.port} (compte ${maskEmail(smtp.user)})`))
        .catch((error) => console.error(`E-MAIL : serveur SMTP non vérifié : ${describeMailError(error)}`));
}
