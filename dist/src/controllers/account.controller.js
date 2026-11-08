"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAddressController = exports.updateAddressController = exports.createAddressController = exports.listAddressesController = exports.updateProfileController = exports.changePasswordController = exports.resetPasswordController = exports.forgotPasswordController = exports.resendVerificationController = exports.verifyEmailController = void 0;
const appError_1 = require("../utils/appError");
const appError_2 = require("../utils/appError");
const account_service_1 = require("../services/account.service");
const uid = (req) => req.user.userId;
const ok = (res, data = null, message, status = 200) => res.status(status).json({ success: true, data, ...(message ? { message } : {}) });
const fail = (res, error) => {
    // Erreurs prévues (AppError) : statut dédié ; erreurs métier simples : 400 comme le reste du module auth.
    if (error?.status)
        return (0, appError_2.sendError)(res, error);
    return res.status(400).json({ success: false, message: (0, appError_1.safeMessage)(error) });
};
const verifyEmailController = async (req, res) => {
    try {
        await (0, account_service_1.verifyEmail)(req.body.token);
        return ok(res, null, "Adresse e-mail vérifiée");
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.verifyEmailController = verifyEmailController;
const resendVerificationController = async (req, res) => {
    try {
        await (0, account_service_1.resendVerification)(uid(req));
        return ok(res, null, "E-mail envoyé");
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.resendVerificationController = resendVerificationController;
const forgotPasswordController = async (req, res) => {
    try {
        await (0, account_service_1.requestPasswordReset)(req.body.email);
        return ok(res, null, "Si un compte existe avec cette adresse, un e-mail de réinitialisation vient d'être envoyé.");
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.forgotPasswordController = forgotPasswordController;
const resetPasswordController = async (req, res) => {
    try {
        await (0, account_service_1.resetPassword)(req.body.token, req.body.password);
        return ok(res, null, "Mot de passe mis à jour");
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.resetPasswordController = resetPasswordController;
const changePasswordController = async (req, res) => {
    try {
        await (0, account_service_1.changePassword)(uid(req), req.body.currentPassword, req.body.newPassword);
        return ok(res, null, "Mot de passe mis à jour");
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.changePasswordController = changePasswordController;
const updateProfileController = async (req, res) => {
    try {
        return ok(res, await (0, account_service_1.updateProfile)(uid(req), req.body));
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.updateProfileController = updateProfileController;
const listAddressesController = async (req, res) => {
    try {
        return ok(res, await (0, account_service_1.listAddresses)(uid(req)));
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.listAddressesController = listAddressesController;
const createAddressController = async (req, res) => {
    try {
        return ok(res, await (0, account_service_1.createAddress)(uid(req), req.body), undefined, 201);
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.createAddressController = createAddressController;
const updateAddressController = async (req, res) => {
    try {
        return ok(res, await (0, account_service_1.updateAddress)(uid(req), req.params.addressId, req.body));
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.updateAddressController = updateAddressController;
const deleteAddressController = async (req, res) => {
    try {
        await (0, account_service_1.deleteAddress)(uid(req), req.params.addressId);
        return ok(res, null, "Adresse supprimée");
    }
    catch (e) {
        return fail(res, e);
    }
};
exports.deleteAddressController = deleteAddressController;
