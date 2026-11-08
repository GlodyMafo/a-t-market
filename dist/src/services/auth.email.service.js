"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAuthEmail = sendAuthEmail;
const env_1 = require("../config/env");
const mailer_service_1 = require("./email/mailer.service");
const auth_email_templates_1 = require("./email/auth.email.templates");
const PATHS = {
    VERIFY_EMAIL: "/verify-email",
    RESET_PASSWORD: "/reset-password",
};
/** Envoie l'e-mail sans jamais lever d'erreur. Retourne false si l'envoi n'a pas eu lieu. */
async function sendAuthEmail(kind, to, rawToken) {
    if (!env_1.env.FRONTEND_URL) {
        console.warn(`[auth-email] FRONTEND_URL absent : e-mail ${kind} non envoyé`);
        return false;
    }
    const link = `${env_1.env.FRONTEND_URL}${PATHS[kind]}?token=${encodeURIComponent(rawToken)}`;
    const result = await (0, mailer_service_1.sendEmail)({ to, ...(0, auth_email_templates_1.renderAuthEmail)(kind, link) });
    if (!result.ok) {
        console.warn(`[auth-email] ${kind} non envoyé : ${result.error}`);
        // Développement uniquement : permet de tester sans SMTP. Jamais en production.
        if (process.env.NODE_ENV !== "production")
            console.warn(`[auth-email][dev] lien : ${link}`);
    }
    return result.ok;
}
