import cron from "node-cron";
import { expireUnpaidOrders } from "../services/order.expiration.service";

export function startOrderExpirationJob() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      await expireUnpaidOrders();
    } catch (error: any) {
      console.error("ORDER EXPIRATION JOB ERROR:", error.message);
    }
  });

  console.log("Order expiration scheduler started");
}