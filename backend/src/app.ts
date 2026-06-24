import express from "express";
import cors from "cors";

import healthRoutes from "./routes/health.routes";
import productRoutes from "./routes/product.routes";

const app = express();

app.use(cors());

app.use(express.json());

app.use("/health", healthRoutes);
app.use(
 "/api/products",
 productRoutes
);

export default app;