"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = notFoundHandler;
exports.errorHandler = errorHandler;
const appError_1 = require("../utils/appError");
function notFoundHandler(_req, res) {
    res.status(404).json({ success: false, message: "Route introuvable" });
}
// Filet de sécurité : attrape ce qu'aucun contrôleur n'a géré (JSON invalide, bug imprévu…).
function errorHandler(err, _req, res, next) {
    if (res.headersSent)
        return next(err);
    const type = err?.type;
    if (type === "entity.parse.failed") {
        return res.status(400).json({ success: false, message: "Corps de requête JSON invalide" });
    }
    if (type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "Corps de requête trop volumineux" });
    }
    return (0, appError_1.sendError)(res, err);
}
