import "dotenv/config";

import http from "node:http";
import app from "./app";
import { initRealtime } from "./realtime/socket";
import { initializeSettings } from "./services/settings.service";
import { startPaymentReconciliationJob } from "./jobs/payment.reconciliation.job";
import { startOrderExpirationJob } from "./jobs/order.expiration.job";

const PORT = Number(process.env.PORT) || 5000;

const server = http.createServer(app);

initRealtime(server);

server.listen(PORT, () => {
  console.log(`A&T Market API running on port ${PORT}`);
});

startPaymentReconciliationJob();
startOrderExpirationJob();

initializeSettings()
  .then(() => console.log("Global settings initialized"))
  .catch(console.error);