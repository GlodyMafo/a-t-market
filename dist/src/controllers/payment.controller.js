"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentController = createPaymentController;
const appError_1 = require("../utils/appError");
const payment_service_1 = require("../services/payment.service");
const payment_validator_1 = require("../validators/payment.validator");
async function createPaymentController(req, res) {
    try {
        const validatedData = payment_validator_1.createPaymentSchema.parse(req.body);
        const { orderId, paymentType, phoneNumber, provider } = validatedData;
        const payment = await (0, payment_service_1.createPayment)(orderId, req.user.userId, phoneNumber, provider, paymentType);
        return res.status(201).json({
            success: true,
            data: payment
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
