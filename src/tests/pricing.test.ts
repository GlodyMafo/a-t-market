import "./setup";

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeQuote } from "../services/pricing.service";

const REGLES = { commissionRate: 15, chinaPricePerKg: 14, fixedFee: 8 };
const calc = (productPrice: number | string, weightKg: number | string | null) =>
  computeQuote({ productPrice, weightKg, settings: REGLES });

test("Règle métier : 20 $ + 0,5 kg -> transport 7, commission 3, frais 8, total 38", () => {
  const q = calc(20, 0.5);
  assert.equal(q.shippingCost.toString(), "7");
  assert.equal(q.commissionCost.toString(), "3");
  assert.equal(q.fixedFee.toString(), "8");
  assert.equal(q.customsCost.toString(), "0");
  assert.equal(q.totalPrice.toString(), "38");
  assert.equal(q.isProvisional, false);
});

test("Les frais de douane ne sont JAMAIS comptés une seconde fois", () => {
  assert.equal(calc(50, 2).customsCost.toString(), "0");
  // total = prix + transport + commission + frais fixes, sans autre terme
  const q = calc(50, 2);
  assert.equal(q.totalPrice.toString(), "93.5"); // 50 + 28 + 7.5 + 8
});

test("Arrondi commercial : 15 % de 10,10 = 1,515 -> 1,52 (et non 1,51)", () => {
  assert.equal(calc("10.10", 1).commissionCost.toString(), "1.52");
});

test("Exactitude décimale : 15 % de 19,99 = 2,9985 -> 3", () => {
  assert.equal(calc("19.99", 1).commissionCost.toString(), "3");
});

test("Poids avec décimales : 0,3 kg x 14 = 4,2", () => {
  assert.equal(calc("12.99", "0.3").shippingCost.toString(), "4.2");
  assert.equal(calc("12.99", "0.3").totalPrice.toString(), "27.14"); // 12.99 + 4.2 + 1.95 + 8
});

test("Le total est TOUJOURS la somme des composantes arrondies (200 cas)", () => {
  for (let i = 0; i < 200; i++) {
    const prix = (Math.random() * 500 + 0.01).toFixed(2);
    const poids = (Math.random() * 20 + 0.01).toFixed(2);
    const q = calc(prix, poids);
    const somme = q.productPrice
      .plus(q.shippingCost)
      .plus(q.commissionCost)
      .plus(q.customsCost)
      .plus(q.fixedFee);
    assert.equal(q.totalPrice.toString(), somme.toString(), `prix ${prix}, poids ${poids}`);
    // chaque composante a au plus 2 décimales
    for (const c of [q.shippingCost, q.commissionCost, q.totalPrice]) {
      assert.ok(c.decimalPlaces() <= 2);
    }
  }
});

test("Poids inconnu : transport 0 mais devis PROVISOIRE (jamais un poids de 0 kg réel)", () => {
  const q = calc(20, null);
  assert.equal(q.shippingCost.toString(), "0");
  assert.equal(q.isProvisional, true);
  assert.equal(q.totalPrice.toString(), "31"); // 20 + 0 + 3 + 8, provisoire
});

test("Poids de 0 kg refusé : ce n'est pas un poids inconnu", () => {
  assert.throws(() => calc(20, 0), /poids/);
  assert.throws(() => calc(20, -1), /poids/);
  assert.throws(() => calc(20, 5000), /poids/);
  assert.throws(() => calc(20, "abc"), /poids|Decimal/i);
});

test("Prix invalides refusés", () => {
  for (const prix of [0, -5, NaN, Infinity, 1_000_000]) {
    assert.throws(() => calc(prix, 1), /prix/, String(prix));
  }
});

test("Les réglages sont lus tels quels : taux 10 % / 12 / 5 donnent un autre prix", () => {
  const q = computeQuote({
    productPrice: 20,
    weightKg: 0.5,
    settings: { commissionRate: 10, chinaPricePerKg: 12, fixedFee: 5 },
  });
  assert.equal(q.totalPrice.toString(), "33"); // 20 + 6 + 2 + 5
});