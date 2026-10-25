import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedNextStatuses,
  assertTransition,
  getOrderKind,
  InvalidTransitionError,
  TRACKING_STATUSES,
} from "../services/orderFlow";

const local = { quoteId: null };
const intl = { quoteId: "q1" };

test("Type de commande : locale, internationale, mixte", () => {
  assert.equal(getOrderKind([local, local]), "LOCAL");
  assert.equal(getOrderKind([intl]), "INTERNATIONAL");
  assert.equal(getOrderKind([local, intl]), "MIXED");
});

test("Sans événement : seul « Commande validée » est possible", () => {
  for (const kind of ["LOCAL", "INTERNATIONAL", "MIXED"] as const) {
    assert.deepEqual(allowedNextStatuses(kind, null), ["ORDER_VALIDATED"]);
  }
});

test("Parcours local complet, dans l'ordre", () => {
  const ordre = ["ORDER_VALIDATED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
  assertTransition("LOCAL", null, ordre[0]);
  for (let i = 0; i < ordre.length - 1; i++) assertTransition("LOCAL", ordre[i], ordre[i + 1]);
});

test("Parcours international complet, dans l'ordre", () => {
  const ordre = [
    "ORDER_VALIDATED", "PURCHASED", "IN_CHINA", "IN_TRANSIT", "ARRIVED_DRC", "DELIVERED",
  ] as const;
  assertTransition("INTERNATIONAL", null, ordre[0]);
  for (let i = 0; i < ordre.length - 1; i++) {
    assertTransition("INTERNATIONAL", ordre[i], ordre[i + 1]);
  }
});

test("International : la livraison à domicile est facultative après l'arrivée en RDC", () => {
  assertTransition("INTERNATIONAL", "ARRIVED_DRC", "OUT_FOR_DELIVERY");
  assertTransition("INTERNATIONAL", "OUT_FOR_DELIVERY", "DELIVERED");
});

test("Une commande mixte suit le parcours international", () => {
  assert.deepEqual(allowedNextStatuses("MIXED", "ORDER_VALIDATED"), ["PURCHASED"]);
  assert.throws(() => assertTransition("MIXED", "ORDER_VALIDATED", "PREPARING"), InvalidTransitionError);
});

test("Interdit : sauter une étape, reculer, répéter, passer à Livré trop tôt", () => {
  assert.throws(() => assertTransition("INTERNATIONAL", "ORDER_VALIDATED", "IN_CHINA"), InvalidTransitionError);
  assert.throws(() => assertTransition("INTERNATIONAL", "IN_TRANSIT", "PURCHASED"), InvalidTransitionError);
  assert.throws(() => assertTransition("INTERNATIONAL", "IN_CHINA", "IN_CHINA"), InvalidTransitionError);
  assert.throws(() => assertTransition("INTERNATIONAL", "ORDER_VALIDATED", "DELIVERED"), InvalidTransitionError);
  assert.throws(() => assertTransition("LOCAL", "ORDER_VALIDATED", "DELIVERED"), InvalidTransitionError);
  assert.throws(() => assertTransition("LOCAL", null, "DELIVERED"), InvalidTransitionError);
});

test("Interdit : étapes internationales sur une commande locale (et l'inverse)", () => {
  assert.throws(() => assertTransition("LOCAL", "ORDER_VALIDATED", "PURCHASED"), InvalidTransitionError);
  assert.throws(() => assertTransition("INTERNATIONAL", "ORDER_VALIDATED", "PREPARING"), InvalidTransitionError);
});

test("Après « Livré », plus rien n'est possible", () => {
  for (const kind of ["LOCAL", "INTERNATIONAL", "MIXED"] as const) {
    assert.deepEqual(allowedNextStatuses(kind, "DELIVERED"), []);
    for (const s of TRACKING_STATUSES) {
      assert.throws(() => assertTransition(kind, "DELIVERED", s), InvalidTransitionError);
    }
  }
});

test("Le message d'erreur est en français et liste les statuts possibles", () => {
  try {
    assertTransition("INTERNATIONAL", "ORDER_VALIDATED", "IN_CHINA");
    assert.fail("aurait dû lever une erreur");
  } catch (e: any) {
    assert.match(e.message, /Transition impossible/);
    assert.match(e.message, /Produit acheté/);
  }
});