
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { isEmailEnabled, sendEmail } from "./email/mailer.service";
import {
  isEmailTrackingStatus,
  renderEmail,
  type EmailEvent,
} from "./email/email.templates";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;

// Le verrou dure plus longtemps que le timeout SMTP de 30 secondes.
// Si le processus tombe, la notification redevient éligible après expiration.
const RESERVATION_MS = 2 * 60 * 1000;

// Délais avant les tentatives 2, 3, 4 et 5.
const RETRY_DELAYS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
] as const;

type NotificationEmail = {
  id: string;
  type: string;
  orderId: string | null;
  title: string;
  message: string;
  data: unknown;
  createdAt: Date;
  user: {
    email: string;
  };
};

type ProcessOptions = {
  /** Horloge injectable pour rendre les tests déterministes. */
  now?: Date;
  batchSize?: number;
};

export type EmailProcessingResult = {
  disabled: boolean;
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
};

function objectData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  return data as Record<string, unknown>;
}

function isAmount(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Convertit les données internes d'une notification en événement d'e-mail.
 * Les événements incomplets ne sont jamais envoyés.
 */
function buildEmailEvent(
  notification: NotificationEmail
): EmailEvent | null {
  const data = objectData(notification.data);

  switch (notification.type) {
    case "ORDER_CREATED": {
      if (!isAmount(data.totalAmount)) return null;

      return {
        kind: "ORDER_CREATED",
        totalAmount: data.totalAmount,
        ...(typeof data.reservationMinutes === "number"
          ? { reservationMinutes: data.reservationMinutes }
          : {}),
      };
    }

    case "PAYMENT_CONFIRMED": {
      if (
        !isAmount(data.paidAmount) ||
        !isAmount(data.remainingAmount)
      ) {
        return null;
      }

      return {
        kind: "PAYMENT_CONFIRMED",
        paidAmount: data.paidAmount,
        remainingAmount: data.remainingAmount,
        orderFullyPaid: data.orderStatus === "PAID",
      };
    }

    case "PAYMENT_FAILED": {
      if (!isAmount(data.amount)) return null;

      return {
        kind: "PAYMENT_FAILED",
        amount: data.amount,
      };
    }

    case "ORDER_STATUS_CHANGED": {
      if (
        typeof data.status !== "string" ||
        !isEmailTrackingStatus(data.status)
      ) {
        return null;
      }

      return {
        kind: "TRACKING",
        status: data.status,
        ...(typeof data.emailMessage === "string"
          ? { message: data.emailMessage }
          : {}),
      };
    }

    case "ORDER_CANCELLED":
      return { kind: "ORDER_CANCELLED" };

    default:
      return null;
  }
}

function referenceCommande(orderId: string): string {
  return `#${orderId.slice(-6).toUpperCase()}`;
}

async function marquerEchecDefinitif(
  id: string,
  attempt: number,
  leaseUntil: Date,
  error: string
) {
  return prisma.notification.updateMany({
    where: {
      id,
      emailStatus: "PENDING",
      emailAttempts: attempt,
      emailNextAttemptAt: leaseUntil,
    },
    data: {
      emailStatus: "FAILED",
      emailNextAttemptAt: null,
      emailError: error.slice(0, 500),
    },
  });
}

async function traiterNotification(
  id: string,
  now: Date
): Promise<"SENT" | "RETRIED" | "FAILED" | "SKIPPED"> {
  const leaseUntil = new Date(now.getTime() + RESERVATION_MS);

  // Réservation atomique : un seul worker peut obtenir cette notification.
  const reservation = await prisma.notification.updateMany({
    where: {
      id,
      emailStatus: "PENDING",
      emailAttempts: { lt: MAX_ATTEMPTS },
      OR: [
        { emailNextAttemptAt: null },
        { emailNextAttemptAt: { lte: now } },
      ],
    },
    data: {
      emailAttempts: { increment: 1 },
      emailLastAttemptAt: now,
      emailNextAttemptAt: leaseUntil,
    },
  });

  if (reservation.count !== 1) return "SKIPPED";

  const notification = await prisma.notification.findUnique({
    where: { id },
    include: {
      user: {
        select: { email: true },
      },
    },
  }) as NotificationEmail | null;

  const attempt = await prisma.notification.findUnique({
    where: { id },
    select: { emailAttempts: true },
  });

  if (!notification || !attempt) return "SKIPPED";

  const attemptNumber = attempt.emailAttempts;

  // Un événement incomplet ne sera jamais envoyé, ni relancé inutilement.
  if (!notification.orderId || !notification.user.email) {
    await marquerEchecDefinitif(
      id,
      attemptNumber,
      leaseUntil,
      "Données du destinataire ou de la commande manquantes"
    );
    return "FAILED";
  }

  const event = buildEmailEvent(notification);

  if (!event) {
    await marquerEchecDefinitif(
      id,
      attemptNumber,
      leaseUntil,
      "Données de notification incompatibles avec le modèle d'e-mail"
    );
    return "FAILED";
  }

  const rendered = renderEmail(event, {
    orderRef: referenceCommande(notification.orderId),
    occurredAt: notification.createdAt,
    frontendUrl: env.FRONTEND_URL,
  });

  const result = await sendEmail({
    to: notification.user.email,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    inlineImages: rendered.inlineImages,
  });

  if (result.ok) {
    const updated = await prisma.notification.updateMany({
      where: {
        id,
        emailStatus: "PENDING",
        emailAttempts: attemptNumber,
        emailNextAttemptAt: leaseUntil,
      },
      data: {
        emailStatus: "SENT",
        emailSentAt: new Date(),
        emailNextAttemptAt: null,
        emailError: null,
      },
    });

    return updated.count === 1 ? "SENT" : "SKIPPED";
  }

  if (attemptNumber >= MAX_ATTEMPTS) {
    await marquerEchecDefinitif(
      id,
      attemptNumber,
      leaseUntil,
      result.error
    );
    return "FAILED";
  }

  const delay = RETRY_DELAYS_MS[attemptNumber - 1];
  const nextAttempt = new Date(now.getTime() + delay);

  const updated = await prisma.notification.updateMany({
    where: {
      id,
      emailStatus: "PENDING",
      emailAttempts: attemptNumber,
      emailNextAttemptAt: leaseUntil,
    },
    data: {
      emailStatus: "PENDING",
      emailNextAttemptAt: nextAttempt,
      emailError: result.error.slice(0, 500),
    },
  });

  return updated.count === 1 ? "RETRIED" : "SKIPPED";
}

/**
 * Traite un lot d'e-mails arrivés à échéance.
 *
 * Ne bloque jamais les opérations métier : ce service est exécuté
 * indépendamment des commandes et des paiements.
 */
export async function processPendingEmails(
  options: ProcessOptions = {}
): Promise<EmailProcessingResult> {
  const result: EmailProcessingResult = {
    disabled: false,
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
  };

  if (!isEmailEnabled()) {
    return { ...result, disabled: true };
  }

  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? BATCH_SIZE;

  // Termine les réservations expirées dont les cinq tentatives ont été consommées.
  await prisma.notification.updateMany({
    where: {
      emailStatus: "PENDING",
      emailAttempts: { gte: MAX_ATTEMPTS },
      emailNextAttemptAt: { lte: now },
    },
    data: {
      emailStatus: "FAILED",
      emailNextAttemptAt: null,
      emailError: "Nombre maximal de tentatives atteint",
    },
  });

  const due = await prisma.notification.findMany({
    where: {
      emailStatus: "PENDING",
      emailAttempts: { lt: MAX_ATTEMPTS },
      OR: [
        { emailNextAttemptAt: null },
        { emailNextAttemptAt: { lte: now } },
      ],
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: batchSize,
  });

  for (const item of due) {
    try {
      const status = await traiterNotification(item.id, now);

      if (status === "SKIPPED") continue;

      result.claimed++;

      if (status === "SENT") result.sent++;
      if (status === "RETRIED") result.retried++;
      if (status === "FAILED") result.failed++;
    } catch (error) {
      // Une erreur de base ou de traitement ne doit pas interrompre le lot.
      // La réservation expirera et pourra être récupérée par un prochain passage.
      console.error(
        `E-MAIL JOB : traitement impossible pour la notification ${item.id}`,
        error instanceof Error ? error.name : "Erreur inconnue"
      );
    }
  }

  return result;
}
