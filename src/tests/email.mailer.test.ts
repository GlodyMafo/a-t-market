import "./setup";

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  buildTransportOptions,
  describeMailError,
  isEmailEnabled,
  maskEmail,
  sendEmail,
  setMailTransport,
  type MailMessage,
  type MailTransport,
} from "../services/email/mailer.service";

const SECRET = "SECRET-MOT-DE-PASSE-123";

const MAIL = {
  to: "client@example.com",
  subject: "Sujet",
  text: "Bonjour",
  html: "<p>Bonjour</p>",
};

let logs: string[] = [];
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  logs = [];
  console.error = (...args: unknown[]) => void logs.push(args.join(" "));
  console.warn = (...args: unknown[]) => void logs.push(args.join(" "));
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
  setMailTransport(null);
});

function transportFactice(
  impl?: (m: MailMessage) => Promise<{ messageId?: string }>
) {
  const envoyes: MailMessage[] = [];
  const transport: MailTransport = {
    async send(message) {
      envoyes.push(message);
      return impl ? impl(message) : { messageId: "id-test-1" };
    },
  };
  return { envoyes, transport };
}

test("Sans configuration SMTP ni transport : e-mail désactivé, aucun envoi, aucune exception", async () => {
  assert.equal(isEmailEnabled(), false);
  const r = await sendEmail(MAIL);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /désactivé/);
});

test("Envoi réussi avec un transport factice : message complet et expéditeur AT-MARKET", async () => {
  const { envoyes, transport } = transportFactice();
  setMailTransport(transport);
  assert.equal(isEmailEnabled(), true);

  const r = await sendEmail(MAIL);
  assert.deepEqual(r, { ok: true, messageId: "id-test-1" });

  assert.equal(envoyes.length, 1);
  assert.equal(envoyes[0].to, "client@example.com");
  assert.equal(envoyes[0].subject, "Sujet");
  assert.equal(envoyes[0].text, "Bonjour");
  assert.equal(envoyes[0].html, "<p>Bonjour</p>");
  assert.equal(envoyes[0].from.name, "AT-MARKET");
});

test("Gmail indisponible : échec propre, jamais d'exception, aucun identifiant dans le résultat ni les logs", async () => {
  const { transport } = transportFactice(async () => {
    throw Object.assign(new Error(`connect ETIMEDOUT smtp.gmail.com:587 pass=${SECRET}`), {
      code: "ETIMEDOUT",
    });
  });
  setMailTransport(transport);

  const r = await sendEmail(MAIL);
  assert.equal(r.ok, false);
  const erreur = (r as { error: string }).error;
  assert.match(erreur, /injoignable/);
  assert.match(erreur, /ETIMEDOUT/);
  assert.equal(erreur.includes(SECRET), false);
  assert.equal(logs.join("\n").includes(SECRET), false);
});

test("Authentification refusée : message explicite, code de réponse conservé, texte brut jamais exposé", async () => {
  const { transport } = transportFactice(async () => {
    throw Object.assign(new Error(`Invalid login: 535 pass=${SECRET}`), {
      code: "EAUTH",
      responseCode: 535,
    });
  });
  setMailTransport(transport);

  const r = await sendEmail(MAIL);
  assert.equal(r.ok, false);
  const erreur = (r as { error: string }).error;
  assert.match(erreur, /Authentification SMTP refusée/);
  assert.match(erreur, /535/);
  assert.equal(erreur.includes(SECRET), false);
  assert.equal(logs.join("\n").includes(SECRET), false);
});

test("Transport qui lève une exception de façon synchrone : toujours un résultat, jamais d'exception", async () => {
  setMailTransport({
    send() {
      throw new Error(`boom ${SECRET}`);
    },
  });

  const r = await sendEmail(MAIL);
  assert.equal(r.ok, false);
  assert.equal((r as { error: string }).error.includes(SECRET), false);
});

test("Transport qui ne répond jamais : le délai d'attente coupe l'envoi", async () => {
  setMailTransport({ send: () => new Promise(() => {}) });

  const debut = Date.now();
  const r = await sendEmail(MAIL, { timeoutMs: 50 });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /Délai/);
  assert.ok(Date.now() - debut < 2000);
});

test("Destinataire invalide ou tentative d'injection d'en-tête : refus sans appeler le transport", async () => {
  const { envoyes, transport } = transportFactice();
  setMailTransport(transport);

  for (const to of ["pas-un-email", "a@b.com\r\nBcc: autre@x.com", "a@b.com, c@d.com", ""]) {
    const r = await sendEmail({ ...MAIL, to });
    assert.equal(r.ok, false, `devrait refuser : ${JSON.stringify(to)}`);
  }
  assert.equal(envoyes.length, 0);
});

test("Le sujet ne peut pas contenir de retour à la ligne", async () => {
  const { envoyes, transport } = transportFactice();
  setMailTransport(transport);

  await sendEmail({ ...MAIL, subject: "Ligne 1\r\nBcc: autre@x.com" });
  assert.equal(envoyes[0].subject.includes("\n"), false);
  assert.equal(envoyes[0].subject.includes("\r"), false);
});

test("Options Nodemailer : STARTTLS imposé sur 587, délais d'attente définis, authentification présente", () => {
  const smtp = {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    user: "test@example.com",
    password: SECRET,
    fromName: "AT-MARKET",
    fromEmail: "test@example.com",
  };

  const o = buildTransportOptions(smtp);
  assert.equal(o.host, "smtp.gmail.com");
  assert.equal(o.port, 587);
  assert.equal(o.secure, false);
  assert.equal(o.requireTLS, true);
  assert.ok(Number(o.connectionTimeout) > 0 && Number(o.connectionTimeout) <= 30_000);
  assert.ok(Number(o.greetingTimeout) > 0);
  assert.ok(Number(o.socketTimeout) > 0);
  assert.deepEqual(o.auth, { user: "test@example.com", pass: SECRET });

  const ssl = buildTransportOptions({ ...smtp, port: 465, secure: true });
  assert.equal(ssl.secure, true);
  assert.equal(ssl.requireTLS, false);
});

test("describeMailError : code inconnu ou valeur inattendue donne un message générique", () => {
  assert.equal(describeMailError(new Error(`secret ${SECRET}`)), "Échec d'envoi de l'e-mail");
  assert.equal(describeMailError(null), "Échec d'envoi de l'e-mail");
  assert.equal(describeMailError("texte"), "Échec d'envoi de l'e-mail");
});

test("maskEmail : masque l'adresse pour les journaux", () => {
  assert.equal(maskEmail("jean.dupont@gmail.com"), "j***@gmail.com");
  assert.equal(maskEmail("invalide"), "***");
});

test("Images intégrées : transmises au transport comme pièces jointes « inline » avec leur CID", async () => {
  const { envoyes, transport } = transportFactice();
  setMailTransport(transport);

  const r = await sendEmail({
    ...MAIL,
    inlineImages: [
      { cid: "at-logo", filename: "logo.png", contentType: "image/png", content: Buffer.from([1, 2, 3]) },
    ],
  });
  assert.equal(r.ok, true);

  assert.equal(envoyes[0].attachments?.length, 1);
  assert.equal(envoyes[0].attachments?.[0].cid, "at-logo");
  assert.equal(envoyes[0].attachments?.[0].contentDisposition, "inline");
  assert.deepEqual([...(envoyes[0].attachments?.[0].content ?? [])], [1, 2, 3]);

  // Sans image : aucune pièce jointe
  await sendEmail(MAIL);
  assert.equal(envoyes[1].attachments, undefined);
});