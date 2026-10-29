import express from "express";
import cors from "cors";
import { env } from "./config/env";

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
import weightCatalogRoutes from "./routes/weightCatalog.routes";
import internationalQuoteRoutes from "./routes/internationalQuote.routes";
import internationalQuoteAdminRoutes from "./routes/internationalQuote.admin.routes";
import externalProductRoutes from "./routes/externalProduct.routes";
import notificationRoutes from "./routes/notification.routes"
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";




const app = express();

// Derrière un proxy (Render) : sans cela, tous les visiteurs auraient la même adresse IP.
if (env.TRUST_PROXY_HOPS > 0) {
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
}


app.use(helmet());

// Seuls les domaines du frontend peuvent appeler l'API depuis un navigateur.
// Les appels sans en-tête Origin (PawaPay, curl, tests) ne sont pas concernés par CORS.
app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || env.CORS_ALLOWED_ORIGINS.includes(origin)),
  })
);

app.use(express.json({ limit: "100kb" }));

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

app.use(
  "/api/weight-catalog",
  weightCatalogRoutes
);

app.use(
  "/api/international-quotes",
  internationalQuoteRoutes
);

app.use(
  "/api/admin/quotes",
  internationalQuoteAdminRoutes
);

app.use(
  "/api/external-products",
  externalProductRoutes
);

app.use(
  "/api/notifications",
  notificationRoutes
);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;