
import cron from "node-cron";
import { processPendingEmails } from "../services/notification.email.service";

let running = false;

export function startEmailRetryJob() {
  cron.schedule("* * * * *", async () => {
    if (running) return;

    running = true;

    try {
      const result = await processPendingEmails();

      if (result.disabled) return;

      if (result.claimed > 0) {
        console.log(
          `E-MAIL JOB : ${result.sent} envoyé(s), ` +
          `${result.retried} relance(s), ${result.failed} échec(s)`
        );
      }
    } catch (error) {
      console.error(
        "E-MAIL JOB ERROR:",
        error instanceof Error ? error.message : "Erreur inconnue"
      );
    } finally {
      running = false;
    }
  });

  console.log("Email retry scheduler started");
}
