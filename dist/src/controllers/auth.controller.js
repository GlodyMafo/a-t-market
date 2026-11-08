"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerController = registerController;
exports.loginController = loginController;
exports.meController = meController;
const appError_1 = require("../utils/appError");
const auth_service_1 = require("../services/auth.service");
const auth_validator_1 = require("../validators/auth.validator");
async function registerController(req, res) {
    try {
        const validatedData = auth_validator_1.registerSchema.parse(req.body);
        const result = await (0, auth_service_1.register)(validatedData);
        return res.status(201).json({
            success: true,
            data: result
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function loginController(req, res) {
    try {
        const validatedData = auth_validator_1.loginSchema.parse(req.body);
        const result = await (0, auth_service_1.login)(validatedData);
        return res.status(200).json({
            success: true,
            data: result
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function meController(req, res) {
    try {
        const user = await (0, auth_service_1.getCurrentUser)(req.user.userId);
        return res.json({
            success: true,
            data: user
        });
    }
    catch (error) {
        return res.status(404).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
