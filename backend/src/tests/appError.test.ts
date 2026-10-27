import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AppError, safeMessage } from "../utils/appError";

const GENERIQUE = "Une erreur est survenue. Réessayez plus tard.";

test("Erreurs prévues et erreurs métier : le message est conservé", () => {
  assert.equal(safeMessage(new Error("Stock insuffisant")), "Stock insuffisant");
  assert.equal(safeMessage(new AppError("Refusé", 409, "X")), "Refusé");
});

test("Erreurs de validation : messages lisibles, pas de JSON brut", () => {
  const r = z.object({ email: z.string().email("Email invalide") }).safeParse({ email: "x" });
  assert.equal(r.success, false);
  if (!r.success) assert.equal(safeMessage(r.error), "Email invalide");
});

test("Erreurs internes (Prisma, base, réseau, bugs) : message générique", () => {
  const prisma = Object.assign(new Error("Invalid `prisma.user.create()` invocation: secret SQL"), {
    code: "P2002",
  });
  const prismaNom = new Error("détail");
  prismaNom.name = "PrismaClientValidationError";
  const reseau = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { code: "ECONNREFUSED" });

  for (const e of [prisma, prismaNom, reseau, new TypeError("x is undefined"), new RangeError("r")]) {
    assert.equal(safeMessage(e), GENERIQUE);
  }
  assert.equal(safeMessage("texte"), GENERIQUE);
  assert.equal(safeMessage(undefined, "Autre"), "Autre");
});