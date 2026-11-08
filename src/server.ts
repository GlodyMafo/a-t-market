import "dotenv/config";

import http from "node:http";
import app from "./app";
import { initRealtime } from "./realtime/socket";
import { initializeSettings } from "./services/settings.service";
import { startPaymentReconciliationJob } from "./jobs/payment.reconciliation.job";
import { startOrderExpirationJob } from "./jobs/order.expiration.job";
import { initMailer } from "./services/email/mailer.service";
import { startEmailRetryJob } from "./jobs/email.retry.job";
import { env } from "./config/env";

const PORT = env.PORT;

const server = http.createServer(app);

initRealtime(server);

server.listen(PORT, () => {
  console.log(`A&T Market API running on port ${PORT}`);
});

startPaymentReconciliationJob();
startOrderExpirationJob();

// Vérification SMTP non bloquante : Gmail indisponible n'empêche pas le démarrage.
initMailer();

// Traitement et récupération des e-mails en attente.
startEmailRetryJob();

initializeSettings()
  .then(() => console.log("Global settings initialized"))
  .catch(console.error);