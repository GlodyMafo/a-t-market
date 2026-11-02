import "dotenv/config";

import { env } from "../config/env";
import { maskEmail, sendEmail } from "../services/email/mailer.service";

async function main() {
  if (!env.SMTP) {
    console.error("SMTP non configuré : renseigne les variables SMTP_* dans ton .env.");
    process.exit(1);
  }

  // Par défaut : ta propre adresse Gmail de test. Un autre destinataire peut être passé en argument.
  const to = process.argv[2] ?? env.SMTP.user;

  const resultat = await sendEmail({
    to,
    subject: "Test AT-MARKET : configuration e-mail",
    text: "Ceci est un e-mail de test envoyé par le backend AT-MARKET.\nSi vous le lisez, la configuration Gmail SMTP fonctionne.",
    html: "<p>Ceci est un e-mail de test envoyé par le backend <strong>AT-MARKET</strong>.</p><p>Si vous le lisez, la configuration Gmail SMTP fonctionne.</p>",
  });

  if (resultat.ok) {
    console.log(`OK : e-mail de test envoyé à ${maskEmail(to)}.`);
    process.exit(0);
  }

  console.error(`ÉCHEC : ${resultat.error}`);
  process.exit(1);
}

main();