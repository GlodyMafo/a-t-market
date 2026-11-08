import "dotenv/config";

import { env } from "../config/env";
import { maskEmail, sendEmail } from "../services/email/mailer.service";
import { renderEmail } from "../services/email/email.templates";

async function main() {
  if (!env.SMTP) {
    console.error("SMTP non configuré : renseigne les variables SMTP_* dans ton .env.");
    process.exit(1);
  }

  const to = process.argv[2] ?? env.SMTP.user;
  const mail = renderEmail(
    { kind: "PAYMENT_CONFIRMED", paidAmount: "34.00", remainingAmount: "0.00", orderFullyPaid: true },
    { orderRef: "#ABC123", occurredAt: new Date(), frontendUrl: env.FRONTEND_URL }
  );

  const resultat = await sendEmail({ to, ...mail });

  if (resultat.ok) {
    console.log(`OK : e-mail de test envoyé à ${maskEmail(to)}.`);
    process.exit(0);
  }
  console.error(`ÉCHEC : ${resultat.error}`);
  process.exit(1);
}

main();