"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_http_1 = __importDefault(require("node:http"));
const app_1 = __importDefault(require("./app"));
const socket_1 = require("./realtime/socket");
const settings_service_1 = require("./services/settings.service");
const payment_reconciliation_job_1 = require("./jobs/payment.reconciliation.job");
const order_expiration_job_1 = require("./jobs/order.expiration.job");
const mailer_service_1 = require("./services/email/mailer.service");
const email_retry_job_1 = require("./jobs/email.retry.job");
const env_1 = require("./config/env");
const PORT = env_1.env.PORT;
const server = node_http_1.default.createServer(app_1.default);
(0, socket_1.initRealtime)(server);
server.listen(PORT, () => {
    console.log(`A&T Market API running on port ${PORT}`);
});
(0, payment_reconciliation_job_1.startPaymentReconciliationJob)();
(0, order_expiration_job_1.startOrderExpirationJob)();
// Vérification SMTP non bloquante : Gmail indisponible n'empêche pas le démarrage.
(0, mailer_service_1.initMailer)();
// Traitement et récupération des e-mails en attente.
(0, email_retry_job_1.startEmailRetryJob)();
(0, settings_service_1.initializeSettings)()
    .then(() => console.log("Global settings initialized"))
    .catch(console.error);
