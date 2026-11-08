"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOrderExpirationJob = startOrderExpirationJob;
const node_cron_1 = __importDefault(require("node-cron"));
const order_expiration_service_1 = require("../services/order.expiration.service");
function startOrderExpirationJob() {
    node_cron_1.default.schedule("*/5 * * * *", async () => {
        try {
            await (0, order_expiration_service_1.expireUnpaidOrders)();
        }
        catch (error) {
            console.error("ORDER EXPIRATION JOB ERROR:", error.message);
        }
    });
    console.log("Order expiration scheduler started");
}
