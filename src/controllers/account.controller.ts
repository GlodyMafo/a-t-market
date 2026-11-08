import type { Request, Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { safeMessage } from "../utils/appError";
import { sendError } from "../utils/appError";
import {
  changePassword, createAddress, deleteAddress, listAddresses, requestPasswordReset,
  resendVerification, resetPassword, updateAddress, updateProfile, verifyEmail,
} from "../services/account.service";

const uid = (req: Request) => (req as AuthRequest).user!.userId;
const ok = (res: Response, data: unknown = null, message?: string, status = 200) =>
  res.status(status).json({ success: true, data, ...(message ? { message } : {}) });
const fail = (res: Response, error: unknown) => {
  // Erreurs prévues (AppError) : statut dédié ; erreurs métier simples : 400 comme le reste du module auth.
  if ((error as { status?: number })?.status) return sendError(res, error);
  return res.status(400).json({ success: false, message: safeMessage(error) });
};

export const verifyEmailController = async (req: Request, res: Response) => {
  try { await verifyEmail(req.body.token); return ok(res, null, "Adresse e-mail vérifiée"); } catch (e) { return fail(res, e); }
};
export const resendVerificationController = async (req: Request, res: Response) => {
  try { await resendVerification(uid(req)); return ok(res, null, "E-mail envoyé"); } catch (e) { return fail(res, e); }
};
export const forgotPasswordController = async (req: Request, res: Response) => {
  try {
    await requestPasswordReset(req.body.email);
    return ok(res, null, "Si un compte existe avec cette adresse, un e-mail de réinitialisation vient d'être envoyé.");
  } catch (e) { return fail(res, e); }
};
export const resetPasswordController = async (req: Request, res: Response) => {
  try { await resetPassword(req.body.token, req.body.password); return ok(res, null, "Mot de passe mis à jour"); } catch (e) { return fail(res, e); }
};
export const changePasswordController = async (req: Request, res: Response) => {
  try { await changePassword(uid(req), req.body.currentPassword, req.body.newPassword); return ok(res, null, "Mot de passe mis à jour"); } catch (e) { return fail(res, e); }
};
export const updateProfileController = async (req: Request, res: Response) => {
  try { return ok(res, await updateProfile(uid(req), req.body)); } catch (e) { return fail(res, e); }
};
export const listAddressesController = async (req: Request, res: Response) => {
  try { return ok(res, await listAddresses(uid(req))); } catch (e) { return fail(res, e); }
};
export const createAddressController = async (req: Request, res: Response) => {
  try { return ok(res, await createAddress(uid(req), req.body), undefined, 201); } catch (e) { return fail(res, e); }
};
export const updateAddressController = async (req: Request, res: Response) => {
  try { return ok(res, await updateAddress(uid(req), req.params.addressId as string, req.body)); } catch (e) { return fail(res, e); }
};
export const deleteAddressController = async (req: Request, res: Response) => {
  try { await deleteAddress(uid(req), req.params.addressId as string); return ok(res, null, "Adresse supprimée"); } catch (e) { return fail(res, e); }
};