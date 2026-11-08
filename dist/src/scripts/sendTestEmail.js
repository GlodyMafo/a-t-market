"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const env_1 = require("../config/env");
const mailer_service_1 = require("../services/email/mailer.service");
const email_templates_1 = require("../services/email/email.templates");
async function main() {
    if (!env_1.env.SMTP) {
        console.error("SMTP non configuré : renseigne les variables SMTP_* dans ton .env.");
        process.exit(1);
    }
    const to = process.argv[2] ?? env_1.env.SMTP.user;
    const mail = (0, email_templates_1.renderEmail)({ kind: "PAYMENT_CONFIRMED", paidAmount: "34.00", remainingAmount: "0.00", orderFullyPaid: true }, { orderRef: "#ABC123", occurredAt: new Date(), frontendUrl: env_1.env.FRONTEND_URL });
    const resultat = await (0, mailer_service_1.sendEmail)({ to, ...mail });
    if (resultat.ok) {
        console.log(`OK : e-mail de test envoyé à ${(0, mailer_service_1.maskEmail)(to)}.`);
        process.exit(0);
    }
    console.error(`ÉCHEC : ${resultat.error}`);
    process.exit(1);
}
main();
