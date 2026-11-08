"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMiddleware = adminMiddleware;
function adminMiddleware(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Non authentifié"
        });
    }
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Accès réservé aux administrateurs"
        });
    }
    next();
}
