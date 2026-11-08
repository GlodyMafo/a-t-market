"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startEmailRetryJob = startEmailRetryJob;
const node_cron_1 = __importDefault(require("node-cron"));
const notification_email_service_1 = require("../services/notification.email.service");
let running = false;
function startEmailRetryJob() {
    node_cron_1.default.schedule("* * * * *", async () => {
        if (running)
            return;
        running = true;
        try {
            const result = await (0, notification_email_service_1.processPendingEmails)();
            if (result.disabled)
                return;
            if (result.claimed > 0) {
                console.log(`E-MAIL JOB : ${result.sent} envoyé(s), ` +
                    `${result.retried} relance(s), ${result.failed} échec(s)`);
            }
        }
        catch (error) {
            console.error("E-MAIL JOB ERROR:", error instanceof Error ? error.message : "Erreur inconnue");
        }
        finally {
            running = false;
        }
    });
    console.log("Email retry scheduler started");
}
