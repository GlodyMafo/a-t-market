import express from "express";
import cors from "cors";

import healthRoutes from "./routes/health.routes";
import productRoutes from "./routes/product.routes";
import cartRoutes from "./routes/cart.routes";
import orderRoutes from "./routes/order.routes";
import paymentRoutes from "./routes/payment.routes";
import authRoutes from "./routes/auth.routes";
import trackingRoutes from "./routes/tracking.routes";
import adminRoutes from "./routes/admin.routes"
import categoryRoutes from "./routes/category.routes";
import subCategoryRoutes from "./routes/subcategory.routes";

import { initializeSettings} from "./services/settings.service";

import { startPaymentReconciliationJob } from "./jobs/payment.reconciliation.job";

startPaymentReconciliationJob();

const app = express();

app.use(cors());

app.use(express.json());

app.use("/health", healthRoutes);

app.use(
 "/api/products",
 productRoutes
);

app.use(
  "/api/cart",
  cartRoutes
);

app.use(
 "/api/orders",
 orderRoutes
);

app.use(

  "/api/payments",

  paymentRoutes

);

app.use(
  "/auth",
  authRoutes
);

app.use(
  "/api/tracking",
  trackingRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/categories",
  categoryRoutes
);

app.use(
  "/api/subcategories",
  subCategoryRoutes
);

initializeSettings()
  .then(() => {

    console.log(
      "Global settings initialized"
    );

  })
  .catch(console.error);

export default app;