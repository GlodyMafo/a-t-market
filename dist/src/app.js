"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const cart_routes_1 = __importDefault(require("./routes/cart.routes"));
const order_routes_1 = __importDefault(require("./routes/order.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const tracking_routes_1 = __importDefault(require("./routes/tracking.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const subcategory_routes_1 = __importDefault(require("./routes/subcategory.routes"));
const weightCatalog_routes_1 = __importDefault(require("./routes/weightCatalog.routes"));
const internationalQuote_routes_1 = __importDefault(require("./routes/internationalQuote.routes"));
const internationalQuote_admin_routes_1 = __importDefault(require("./routes/internationalQuote.admin.routes"));
const externalProduct_routes_1 = __importDefault(require("./routes/externalProduct.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const helmet_1 = __importDefault(require("helmet"));
const errorHandler_1 = require("./middlewares/errorHandler");
const app = (0, express_1.default)();
// Derrière un proxy (Render) : sans cela, tous les visiteurs auraient la même adresse IP.
if (env_1.env.TRUST_PROXY_HOPS > 0) {
    app.set("trust proxy", env_1.env.TRUST_PROXY_HOPS);
}
app.use((0, helmet_1.default)());
// Seuls les domaines du frontend peuvent appeler l'API depuis un navigateur.
// Les appels sans en-tête Origin (PawaPay, curl, tests) ne sont pas concernés par CORS.
app.use((0, cors_1.default)({
    origin: (origin, callback) => callback(null, !origin || env_1.env.CORS_ALLOWED_ORIGINS.includes(origin)),
}));
app.use(express_1.default.json({ limit: "100kb" }));
app.use("/health", health_routes_1.default);
app.use("/api/products", product_routes_1.default);
app.use("/api/cart", cart_routes_1.default);
app.use("/api/orders", order_routes_1.default);
app.use("/api/payments", payment_routes_1.default);
app.use("/auth", auth_routes_1.default);
app.use("/api/tracking", tracking_routes_1.default);
app.use("/api/admin", admin_routes_1.default);
app.use("/api/categories", category_routes_1.default);
app.use("/api/subcategories", subcategory_routes_1.default);
app.use("/api/weight-catalog", weightCatalog_routes_1.default);
app.use("/api/international-quotes", internationalQuote_routes_1.default);
app.use("/api/admin/quotes", internationalQuote_admin_routes_1.default);
app.use("/api/external-products", externalProduct_routes_1.default);
app.use("/api/notifications", notification_routes_1.default);
app.use("/api/users", user_routes_1.default);
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
exports.default = app;
