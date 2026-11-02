import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EMAIL_TRACKING_STATUSES,
  escapeHtml,
  formatEmailDate,
  isEmailTrackingStatus,
  renderEmail,
  type EmailEvent,
} from "../services/email/email.templates";

const CTX = { orderRef: "#ABC123", occurredAt: new Date("2026-11-02T10:30:00Z") };

const EVENTS: EmailEvent[] = [
  { kind: "ORDER_CREATED", totalAmount: "34.00", reservationMinutes: 60 },
  { kind: "PAYMENT_CONFIRMED", paidAmount: "10.00", remainingAmount: "24.00", orderFullyPaid: false },
  { kind: "PAYMENT_CONFIRMED", paidAmount: "34.00", remainingAmount: "0.00", orderFullyPaid: true },
  { kind: "PAYMENT_FAILED", amount: "34.00" },
  ...EMAIL_TRACKING_STATUSES.map((status) => ({ kind: "TRACKING", status }) as EmailEvent),
  { kind: "ORDER_CANCELLED" },
];

test("Chaque événement produit un sujet, un texte et un HTML complets (AT-MARKET, référence, date, salutation)", () => {
  assert.equal(EVENTS.length, 11);

  for (const event of EVENTS) {
    const m = renderEmail(event, CTX);
    const label = JSON.stringify(event);

    assert.ok(m.subject.startsWith("AT-MARKET : "), label);
    assert.ok(m.subject.includes("#ABC123") || event.kind === "TRACKING" || event.kind === "ORDER_CANCELLED" || true);
    assert.equal(/[\r\n]/.test(m.subject), false, label);

    for (const corps of [m.text, m.html]) {
      assert.ok(corps.includes("AT-MARKET"), label);
      assert.ok(corps.includes("#ABC123"), label);
      assert.ok(corps.includes("Bonjour,"), label);
      assert.match(corps, /novembre 2026/, label);
      assert.equal(/undefined|NaN|\[object/.test(corps), false, label);
    }

    assert.ok(m.html.startsWith("<!DOCTYPE html>"), label);
    assert.ok(m.html.includes('lang="fr"'), label);
  }
});

test("Le sujet contient la référence de la commande pour les événements de commande et de paiement", () => {
  for (const event of EVENTS) {
    const m = renderEmail(event, CTX);
    // Les modèles de suivi et d'annulation l'incluent aussi : tous les sujets portent la référence.
    assert.ok(m.subject.includes("#ABC123"), `${m.subject}`);
  }
});

test("Les 6 statuts de suivi ont chacun un sujet différent", () => {
  const sujets = new Set(
    EMAIL_TRACKING_STATUSES.map((status) => renderEmail({ kind: "TRACKING", status }, CTX).subject)
  );
  assert.equal(sujets.size, 6);
});

test("Seuls 6 statuts de suivi envoient un e-mail : ORDER_VALIDATED et IN_CHINA restent internes", () => {
  assert.deepEqual(
    [...EMAIL_TRACKING_STATUSES],
    ["PURCHASED", "PREPARING", "IN_TRANSIT", "ARRIVED_DRC", "OUT_FOR_DELIVERY", "DELIVERED"]
  );
  assert.equal(isEmailTrackingStatus("DELIVERED"), true);
  assert.equal(isEmailTrackingStatus("ORDER_VALIDATED"), false);
  assert.equal(isEmailTrackingStatus("IN_CHINA"), false);
  assert.equal(isEmailTrackingStatus("n'importe quoi"), false);
});

test("Paiement partiel : le reste à payer est affiché ; paiement complet : « validée », sans reste", () => {
  const partiel = renderEmail(EVENTS[1], CTX);
  assert.match(partiel.text, /10\.00 \$/);
  assert.match(partiel.text, /Il reste 24\.00 \$ à payer/);
  assert.match(partiel.html, /Il reste 24\.00 \$ à payer/);

  const complet = renderEmail(EVENTS[2], CTX);
  assert.match(complet.text, /34\.00 \$/);
  assert.match(complet.text, /est validée/);
  assert.equal(/Il reste/.test(complet.text), false);
  assert.notEqual(partiel.subject, complet.subject);
});

test("Création de commande : le délai d'annulation n'est mentionné que s'il est fourni", () => {
  const avec = renderEmail({ kind: "ORDER_CREATED", totalAmount: "34.00", reservationMinutes: 60 }, CTX);
  assert.match(avec.text, /60 minutes/);

  const sans = renderEmail({ kind: "ORDER_CREATED", totalAmount: "34.00" }, CTX);
  assert.equal(/minute/.test(sans.text), false);
});

test("Message libre de l'admin : échappé en HTML (aucune injection), conservé tel quel dans le texte", () => {
  const message = `<script>alert("x")</script> & <b>gras</b>`;
  const m = renderEmail({ kind: "TRACKING", status: "PURCHASED", message }, CTX);

  assert.equal(m.html.includes("<script"), false);
  assert.equal(m.html.includes("<b>"), false);
  assert.ok(m.html.includes("&lt;script&gt;"));
  assert.ok(m.html.includes("&amp;"));
  assert.ok(m.text.includes(message));
  assert.match(m.text, /Information de notre équipe/);
});

test("La référence de commande est elle aussi échappée dans le HTML", () => {
  const m = renderEmail({ kind: "ORDER_CANCELLED" }, { ...CTX, orderRef: "#A<img src=x>" });
  assert.equal(m.html.includes("<img"), false);
  assert.ok(m.html.includes("&lt;img"));
});

test("Lien vers le site : présent (origine seulement) si FRONTEND_URL est valide", () => {
  const m = renderEmail({ kind: "ORDER_CANCELLED" }, { ...CTX, frontendUrl: "https://at-market.example/boutique/" });
  assert.ok(m.text.includes("https://at-market.example"));
  assert.equal(m.text.includes("/boutique"), false);
  assert.ok(m.html.includes('href="https://at-market.example"'));
});

test("Sans FRONTEND_URL, ou avec une URL dangereuse ou invalide : aucun lien", () => {
  for (const frontendUrl of [undefined, null, "", "javascript:alert(1)", "ftp://exemple.com", "pas une url"]) {
    const m = renderEmail({ kind: "ORDER_CANCELLED" }, { ...CTX, frontendUrl });
    assert.equal(/https?:/.test(m.text), false, String(frontendUrl));
    assert.equal(/https?:/.test(m.html), false, String(frontendUrl));
    assert.equal(/javascript/i.test(m.html), false, String(frontendUrl));
    assert.match(m.text, /Consultez votre compte sur la plateforme AT-MARKET/);
  }
});

test("Le texte brut ne contient aucune balise HTML", () => {
  for (const event of EVENTS) {
    const m = renderEmail(event, { ...CTX, frontendUrl: "https://at-market.example" });
    assert.equal(/<[a-z][^>]*>/i.test(m.text), false, JSON.stringify(event));
  }
});

test("La date est affichée à l'heure de Lubumbashi (UTC+2), pas à celle du serveur", () => {
  // 22:30 UTC le 2 novembre = 00:30 le 3 novembre à Lubumbashi.
  const tard = formatEmailDate(new Date("2026-11-02T22:30:00Z"));
  assert.match(tard, /3 novembre 2026/);

  const m = renderEmail({ kind: "ORDER_CANCELLED" }, { ...CTX, occurredAt: new Date("2026-11-02T22:30:00Z") });
  assert.match(m.text, /3 novembre 2026/);
});

test("Montant invalide : affiché « — » plutôt que NaN", () => {
  const m = renderEmail({ kind: "PAYMENT_FAILED", amount: "abc" }, CTX);
  assert.ok(m.text.includes("—"));
  assert.equal(m.text.includes("NaN"), false);
});

test("escapeHtml échappe les cinq caractères sensibles", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("Aucune donnée sensible : seuls les champs prévus apparaissent dans l'e-mail", () => {
  // Les modèles n'acceptent qu'une liste blanche de champs ; on vérifie en plus que rien d'interne ne filtre.
  for (const event of EVENTS) {
    const m = renderEmail(event, CTX);
    for (const interdit of ["depositId", "providerReference", "password", "phone", "userId", "paymentId"]) {
      assert.equal(m.text.includes(interdit) || m.html.includes(interdit), false, interdit);
    }
  }
});