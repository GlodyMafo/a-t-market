import "dotenv/config";

import app from "./app";
import { initializeSettings } from "./services/settings.service";
import { startPaymentReconciliationJob } from "./jobs/payment.reconciliation.job";

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`A&T Market API running on port ${PORT}`);
});

startPaymentReconciliationJob();

initializeSettings()
  .then(() => console.log("Global settings initialized"))
  .catch(console.error);