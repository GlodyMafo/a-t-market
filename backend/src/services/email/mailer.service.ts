import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "../../config/env";

/**
 * Service d'envoi d'e-mails (Gmail SMTP via Nodemailer).
 *
 * Règles :
 * - `sendEmail` ne lève JAMAIS d'exception : il retourne un résultat.
 * - Aucun identifiant (mot de passe, réponse brute du serveur) n'est journalisé ni retourné.
 * - Le transport est remplaçable (`setMailTransport`) : les tests n'envoient jamais de vrai e-mail.
 */

/** Image intégrée à l'e-mail (référencée dans le HTML par `cid:`). */
export interface EmailInlineImage {
  cid: string;
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  inlineImages?: EmailInlineImage[];
}

export interface MailMessage {
  from: { name: string; address: string };
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    cid: string;
    contentType: string;
    contentDisposition: "inline";
  }>;
}

export interface MailTransport {
  send(message: MailMessage): Promise<{ messageId?: string }>;
  verify?(): Promise<void>;
}

export type SendResult = { ok: true; messageId?: string } | { ok: false; error: string };

const SOCKET_TIMEOUT_MS = 10_000;
const SEND_TIMEOUT_MS = 30_000;
const VERIFY_TIMEOUT_MS = 15_000;

let override: MailTransport | null = null;
let cached: MailTransport | null = null;

/** Réservé aux tests : remplace le transport réel. `null` rétablit le comportement normal. */
export function setMailTransport(transport: MailTransport | null) {
  override = transport;
}

export function isEmailEnabled(): boolean {
  return override !== null || env.SMTP !== null;
}

/** Options Nodemailer (fonction pure, testable). Le port 587 impose STARTTLS. */
export function buildTransportOptions(
  smtp: NonNullable<typeof env.SMTP>
): SMTPTransport.Options {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: SOCKET_TIMEOUT_MS,
    greetingTimeout: SOCKET_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  };
}

function getTransport(): MailTransport | null {
  if (override) return override;
  if (!env.SMTP) return null;

  if (!cached) {
    const transporter = nodemailer.createTransport(buildTransportOptions(env.SMTP));
    cached = {
      send: async (message) => {
        const info = await transporter.sendMail(message);
        return { messageId: info.messageId };
      },
      verify: async () => {
        await transporter.verify();
      },
    };
  }
  return cached;
}

/** « jean.dupont@gmail.com » devient « j***@gmail.com » : pour les journaux. */
export function maskEmail(address: string): string {
  const [local, domain] = address.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

class SendTimeoutError extends Error {
  readonly code = "ESENDTIMEOUT";
  constructor() {
    super("timeout");
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SendTimeoutError()), ms);
  });
  return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
}

/**
 * Message d'erreur sûr : construit uniquement à partir du code d'erreur,
 * jamais à partir du texte brut (qui peut contenir des identifiants ou des détails serveur).
 */
export function describeMailError(error: unknown): string {
  const e = error as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : undefined;
  const responseCode = typeof e?.responseCode === "number" ? e.responseCode : undefined;

  let base: string;
  switch (code) {
    case "EAUTH":
      base = "Authentification SMTP refusée (vérifiez l'adresse et le mot de passe d'application)";
      break;
    case "ETIMEDOUT":
    case "ECONNECTION":
    case "ECONNREFUSED":
    case "ESOCKET":
    case "ENOTFOUND":
    case "EDNS":
      base = "Serveur SMTP injoignable";
      break;
    case "ESENDTIMEOUT":
      base = "Délai d'envoi dépassé";
      break;
    case "EENVELOPE":
      base = "Adresse expéditeur ou destinataire refusée";
      break;
    default:
      base = "Échec d'envoi de l'e-mail";
  }

  const detail = [code, responseCode].filter((x) => x !== undefined).join(" ");
  return detail ? `${base} (${detail})` : base;
}

// Une adresse ne doit contenir ni retour à la ligne (injection d'en-têtes) ni espace.
const ADRESSE_VALIDE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

function expediteur(): MailMessage["from"] {
  if (env.SMTP) {
    return {
      name: env.SMTP.fromName.replace(/[\r\n]+/g, " ").trim(),
      address: env.SMTP.fromEmail,
    };
  }
  // Uniquement atteint avec un transport de test injecté.
  return { name: "AT-MARKET", address: "test@localhost.invalid" };
}

/** Envoie un e-mail. Ne lève jamais d'exception. */
export async function sendEmail(
  email: OutgoingEmail,
  options: { timeoutMs?: number } = {}
): Promise<SendResult> {
  try {
    const transport = getTransport();
    if (!transport) {
      return { ok: false, error: "E-mail désactivé : aucune configuration SMTP" };
    }

    if (!ADRESSE_VALIDE.test(email.to)) {
      return { ok: false, error: "Adresse destinataire invalide" };
    }

    const info = await withTimeout(
          transport.send({
        from: expediteur(),
        to: email.to,
        subject: email.subject.replace(/[\r\n]+/g, " "),
        text: email.text,
        html: email.html,
        attachments: email.inlineImages?.map((image) => ({
          filename: image.filename,
          content: image.content,
          cid: image.cid,
          contentType: image.contentType,
          contentDisposition: "inline" as const,
        })),
      }),
      options.timeoutMs ?? SEND_TIMEOUT_MS
    );

    return { ok: true, messageId: info?.messageId };
  } catch (error) {
    const message = describeMailError(error);
    console.error(`E-MAIL : envoi impossible vers ${maskEmail(email.to)} : ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * À appeler au démarrage. Ne bloque pas et ne lève jamais d'exception :
 * un Gmail indisponible n'empêche pas le serveur de démarrer.
 */
export function initMailer() {
  if (!env.SMTP) {
    console.warn("E-MAIL désactivé : aucune configuration SMTP (voir .env.example).");
    return;
  }

  const smtp = env.SMTP;
  const transport = getTransport();
  if (!transport?.verify) return;

  withTimeout(transport.verify(), VERIFY_TIMEOUT_MS)
    .then(() =>
      console.log(`E-MAIL prêt : ${smtp.host}:${smtp.port} (compte ${maskEmail(smtp.user)})`)
    )
    .catch((error) =>
      console.error(`E-MAIL : serveur SMTP non vérifié : ${describeMailError(error)}`)
    );
}