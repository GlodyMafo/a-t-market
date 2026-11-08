
import "./setup";

import {
  test,
  before,
  after,
  beforeEach,
  afterEach,
} from "node:test";
import assert from "node:assert/strict";

import {
  startTestDb,
  resetTestDb,
  stopTestDb,
} from "./helpers/testDb";

import { creerCommande } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";

import {
  setMailTransport,
  type MailMessage,
  type MailTransport,
} from "../services/email/mailer.service";

import { recordNotification } from "../services/notification.service";

import {
  processPendingEmails,
} from "../services/notification.email.service";

let messages: MailMessage[] = [];
let sendImpl:
  | ((message: MailMessage) => Promise<{ messageId?: string }>)
  | null = null;

function transportFactice(): MailTransport {
  return {
    async send(message) {
      messages.push(message);

      if (sendImpl) {
        return sendImpl(message);
      }

      return { messageId: "message-test-001" };
    },
  };
}

async function creerNotificationEmail(
  options: {
    type?: "ORDER_CREATED" | "PAYMENT_CONFIRMED" | "PAYMENT_FAILED" | "ORDER_STATUS_CHANGED" | "ORDER_CANCELLED";
    data?: Record<string, unknown>;
  } = {}
) {
  const { user, order } = await creerCommande({ total: "34.00" });

  const notification = await recordNotification(prisma, {
    userId: user.id,
    orderId: order.id,
    type: options.type ?? "ORDER_CREATED",
    title: "Notification de test",
    message: "Message de test",
    data: (options.data ?? {
      totalAmount: "34.00",
      reservationMinutes: 60,
    }) as any,
    emailWanted: true,
  });

  return { user, order, notification };
}

before(async () => {
  await startTestDb();
});

after(async () => {
  setMailTransport(null);
  await prisma.$disconnect();
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();

  messages = [];
  sendImpl = null;

  setMailTransport(transportFactice());
});

afterEach(() => {
  setMailTransport(null);
});

test("Envoi réussi : PENDING devient SENT et le message est construit avec le modèle français", async () => {
  const { user, notification } = await creerNotificationEmail();

  const result = await processPendingEmails();

  assert.equal(result.claimed, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.retried, 0);
  assert.equal(result.failed, 0);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, user.email);
  assert.match(messages[0].subject, /commande/);
  assert.match(messages[0].text, /34\.00 \$/);
  assert.match(messages[0].html, /A&amp;T Market/);
  assert.equal(messages[0].attachments?.length, 1);

  const persisted = await prisma.notification.findUniqueOrThrow({
    where: { id: notification.id },
  });

  assert.equal(persisted.emailStatus, "SENT");
  assert.equal(persisted.emailAttempts, 1);
  assert.ok(persisted.emailLastAttemptAt);
  assert.ok(persisted.emailSentAt);
  assert.equal(persisted.emailNextAttemptAt, null);
  assert.equal(persisted.emailError, null);
});

test("Échec SMTP : la notification reste PENDING et une relance est programmée après une minute", async () => {
  const { notification } = await creerNotificationEmail();

  const now = new Date("2026-11-04T12:00:00.000Z");

  sendImpl = async () => {
    throw Object.assign(new Error("SMTP indisponible"), {
      code: "ETIMEDOUT",
    });
  };

  const result = await processPendingEmails({ now });

  assert.equal(result.claimed, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.retried, 1);
  assert.equal(result.failed, 0);

  const persisted = await prisma.notification.findUniqueOrThrow({
    where: { id: notification.id },
  });

  assert.equal(persisted.emailStatus, "PENDING");
  assert.equal(persisted.emailAttempts, 1);
  assert.equal(
    persisted.emailNextAttemptAt?.getTime(),
    now.getTime() + 60_000
  );
  assert.match(persisted.emailError ?? "", /injoignable/);
});

test("Cinq échecs successifs : la notification termine en FAILED", async () => {
  const { notification } = await creerNotificationEmail();

  sendImpl = async () => {
    throw Object.assign(new Error("SMTP indisponible"), {
      code: "ETIMEDOUT",
    });
  };

  let now = new Date("2026-11-04T12:00:00.000Z");

  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await processPendingEmails({ now });

    assert.equal(result.claimed, 1);
    assert.equal(result.failed, attempt === 5 ? 1 : 0);
    assert.equal(result.retried, attempt === 5 ? 0 : 1);

    const persisted = await prisma.notification.findUniqueOrThrow({
      where: { id: notification.id },
    });

    assert.equal(persisted.emailAttempts, attempt);

    if (attempt < 5) {
      assert.equal(persisted.emailStatus, "PENDING");
      assert.ok(persisted.emailNextAttemptAt);
      now = persisted.emailNextAttemptAt!;
    }
  }

  const final = await prisma.notification.findUniqueOrThrow({
    where: { id: notification.id },
  });

  assert.equal(final.emailStatus, "FAILED");
  assert.equal(final.emailAttempts, 5);
  assert.equal(final.emailNextAttemptAt, null);
});

test("Une notification dont la prochaine tentative est dans le futur n'est pas envoyée", async () => {
  const { notification } = await creerNotificationEmail();

  const future = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.notification.update({
    where: { id: notification.id },
    data: { emailNextAttemptAt: future },
  });

  const result = await processPendingEmails();

  assert.equal(result.claimed, 0);
  assert.equal(messages.length, 0);

  const persisted = await prisma.notification.findUniqueOrThrow({
    where: { id: notification.id },
  });

  assert.equal(persisted.emailStatus, "PENDING");
  assert.equal(persisted.emailAttempts, 0);
});

test("Deux traitements concurrents ne réservent pas deux fois la même notification", async () => {
  const { notification } = await creerNotificationEmail();

  let appels = 0;

  sendImpl = async () => {
    appels++;

    await new Promise((resolve) => setTimeout(resolve, 30));

    return { messageId: "concurrent-test" };
  };

  const [a, b] = await Promise.all([
    processPendingEmails(),
    processPendingEmails(),
  ]);

  assert.equal(a.sent + b.sent, 1);
  assert.equal(appels, 1);
  assert.equal(messages.length, 1);

  const persisted = await prisma.notification.findUniqueOrThrow({
    where: { id: notification.id },
  });

  assert.equal(persisted.emailStatus, "SENT");
  assert.equal(persisted.emailAttempts, 1);
});

test("Une réservation expirée est récupérée après un arrêt du processus", async () => {
  const { notification } = await creerNotificationEmail();

  const now = new Date("2026-11-04T12:00:00.000Z");

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      emailAttempts: 1,
      emailLastAttemptAt: new Date(now.getTime() - 10 * 60_000),
      emailNextAttemptAt: new Date(now.getTime() - 5 * 60_000),
    },
  });

  const result = await processPendingEmails({ now });

  assert.equal(result.sent, 1);

  const persisted = await prisma.notification.findUniqueOrThrow({
    where: { id: notification.id },
  });

  assert.equal(persisted.emailStatus, "SENT");
  assert.equal(persisted.emailAttempts, 2);
});

test("Une notification avec données d'e-mail incomplètes est abandonnée sans envoi", async () => {
  const { notification } = await creerNotificationEmail({
    type: "ORDER_CREATED",
    data: {},
  });

  const result = await processPendingEmails();

  assert.equal(result.failed, 1);
  assert.equal(messages.length, 0);

  const persisted = await prisma.notification.findUniqueOrThrow({
    where: { id: notification.id },
  });

  assert.equal(persisted.emailStatus, "FAILED");
  assert.match(persisted.emailError ?? "", /incompatibles/);
});

test("Une réservation ayant déjà consommé cinq tentatives est définitivement abandonnée après expiration", async () => {
  const { notification } = await creerNotificationEmail();

  const now = new Date("2026-11-04T12:00:00.000Z");

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      emailAttempts: 5,
      emailNextAttemptAt: new Date(now.getTime() - 1_000),
    },
  });

  const result = await processPendingEmails({ now });

  assert.equal(result.claimed, 0);
  assert.equal(messages.length, 0);

  const persisted = await prisma.notification.findUniqueOrThrow({
    where: { id: notification.id },
  });

  assert.equal(persisted.emailStatus, "FAILED");
  assert.equal(persisted.emailNextAttemptAt, null);
});

test("Sans configuration SMTP, le moteur ne consomme aucune tentative", async () => {
  const { notification } = await creerNotificationEmail();

  setMailTransport(null);

  const result = await processPendingEmails();

  assert.equal(result.disabled, true);
  assert.equal(result.claimed, 0);
  assert.equal(messages.length, 0);

  const persisted = await prisma.notification.findUniqueOrThrow({
    where: { id: notification.id },
  });

  assert.equal(persisted.emailStatus, "PENDING");
  assert.equal(persisted.emailAttempts, 0);
});
