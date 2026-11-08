"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPaymentReconciliationJob = startPaymentReconciliationJob;
const node_cron_1 = __importDefault(require("node-cron"));
const payment_reconciliation_service_1 = require("../services/payment.reconciliation.service");
function startPaymentReconciliationJob() {
    node_cron_1.default.schedule("*/5 * * * *", async () => {
        console.log("🔄 PAYMENT RECONCILIATION START");
        try {
            await (0, payment_reconciliation_service_1.reconcilePendingPayments)();
            console.log("✅ PAYMENT RECONCILIATION DONE");
        }
        catch (error) {
            console.error("❌ RECONCILIATION JOB ERROR:", error.message);
        }
    });
    console.log("Payment reconciliation scheduler started");
}
