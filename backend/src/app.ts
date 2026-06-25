import express from "express";
import cors from "cors";

import healthRoutes from "./routes/health.routes";
import productRoutes from "./routes/product.routes";
import cartRoutes from "./routes/cart.routes";
import orderRoutes from "./routes/order.routes";


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

export default app;