import { env } from "../config/env";
import { sendEmail } from "./email/mailer.service";
import { renderAuthEmail, type AuthEmailKind } from "./email/auth.email.templates";

const PATHS: Record<AuthEmailKind, string> = {
  VERIFY_EMAIL: "/verify-email",
  RESET_PASSWORD: "/reset-password",
};

/** Envoie l'e-mail sans jamais lever d'erreur. Retourne false si l'envoi n'a pas eu lieu. */
export async function sendAuthEmail(kind: AuthEmailKind, to: string, rawToken: string): Promise<boolean> {
  if (!env.FRONTEND_URL) {
    console.warn(`[auth-email] FRONTEND_URL absent : e-mail ${kind} non envoyé`);
    return false;
  }
  const link = `${env.FRONTEND_URL}${PATHS[kind]}?token=${encodeURIComponent(rawToken)}`;
  const result = await sendEmail({ to, ...renderAuthEmail(kind, link) });
  if (!result.ok) {
    console.warn(`[auth-email] ${kind} non envoyé : ${result.error}`);
    // Développement uniquement : permet de tester sans SMTP. Jamais en production.
    if (process.env.NODE_ENV !== "production") console.warn(`[auth-email][dev] lien : ${link}`);
  }
  return result.ok;
}