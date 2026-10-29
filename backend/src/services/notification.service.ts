import type { NotificationType, Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { emitToUser } from "../realtime/emitter";
import { NotFoundError } from "../utils/appError";
import type { Paging } from "../utils/pagination";

/** Client Prisma ou transaction : on écrit la notification DANS la transaction du changement qu'elle annonce. */
type Db = Prisma.TransactionClient | typeof prisma;

export const NOTIFICATION_EVENT = "notification";

export interface NewNotification {
  userId: string;
  type: NotificationType;
  orderId?: string;
  title: string;
  message: string;
  data?: Prisma.InputJsonValue;
}

const publicFields = {
  id: true,
  type: true,
  orderId: true,
  title: true,
  message: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const;

/** Écrit la notification au journal. N'envoie rien : voir `publishNotification`, à appeler après le commit. */
export async function recordNotification(db: Db, n: NewNotification) {
  const record = await db.notification.create({
    data: {
      userId: n.userId,
      type: n.type,
      orderId: n.orderId,
      title: n.title,
      message: n.message,
      data: n.data,
    },
    select: { ...publicFields, userId: true },
  });
  return record;
}

export type RecordedNotification = Awaited<ReturnType<typeof recordNotification>>;

/** Livraison temps réel, à appeler APRÈS le commit de la transaction. Ne lève jamais d'erreur. */
export function publishNotification(record: RecordedNotification) {
  const { userId, ...payload } = record;
  emitToUser(userId, NOTIFICATION_EVENT, payload);
}

/** Référence courte d'une commande, lisible par le client. */
export const orderRef = (orderId: string) => `#${orderId.slice(-6).toUpperCase()}`;

export const formatUsd = (value: unknown) => `${Number(value).toFixed(2)} $`;

// ---------- Journal côté client ----------

export async function listNotifications(
  userId: string,
  opts: { unreadOnly: boolean; paging: Paging }
) {
  const where = { userId, ...(opts.unreadOnly ? { readAt: null } : {}) };

  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: publicFields,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...opts.paging,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return { items, total, unread };
}

/** Marque une notification comme lue (la sienne uniquement). Sans effet si elle l'est déjà. */
export async function markNotificationRead(userId: string, id: string) {
  const mine = await prisma.notification.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!mine) throw new NotFoundError("Notification introuvable");

  // `readAt: null` : la première lecture est conservée si deux appels arrivent ensemble.
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });

  return prisma.notification.findUniqueOrThrow({ where: { id }, select: publicFields });
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}