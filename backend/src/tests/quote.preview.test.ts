import "./setup";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { startTestDb, resetTestDb, stopTestDb } from "./helpers/testDb";
import { creerReglages, creerSousCategorie } from "./helpers/fixtures";
import { prisma } from "../lib/prisma";
import { ExtractionGate } from "../services/extractionGate";
import {
  previewInternationalQuote,
  PreviewInputError,
} from "../services/quotePreview.service";
import { verifyQuotePreviewTicket } from "../services/quotePreviewTicket";
import { NormalizedExternalProduct } from "../services/externalProduct.types";

before(async () => {
  await startTestDb();
});
after(async () => {
  await prisma.$disconnect();
  await stopTestDb();
});
beforeEach(async () => {
  await resetTestDb();
});

const URL_OK = "https://www.shein.com/Robe-p-1.html";

const produit = (over: Partial<NormalizedExternalProduct> = {}): NormalizedExternalProduct => ({
  source: "SHEIN",
  url: URL_OK,
  name: "Robe fleurie",
  price: 20,
  currency: "USD",
  images: ["https://img.shein.com/1.jpg"],
  sizes: [],
  colors: [],
  inStock: true,
  ...over,
});

function espion(p: NormalizedExternalProduct = produit()) {
  const appels: string[] = [];
  return {
    appels,
    fetchProduct: async (url: string) => {
      appels.push(url);
      return p;
    },
  };
}

const nouvelleGate = (over = {}) =>
  new ExtractionGate({ ttlMs: 3_600_000, maxEntries: 500, dailyBudget: 300, ...over });

// =============== Calcul ===============

test("Poids du catalogue : aperçu AUTO_APPROVED, 20 $ + 0,5 kg = 38 $, ticket valide", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { fetchProduct } = espion();

  const { ticket, preview } = await previewInternationalQuote(
    { productUrl: URL_OK, subCategoryId: sub.id },
    { gate: nouvelleGate(), fetchProduct }
  );

  assert.equal(preview.status, "AUTO_APPROVED");
  assert.equal(preview.totalPrice, "38");
  assert.equal(preview.shippingCost, "7");
  assert.equal(preview.commissionCost, "3");
  assert.equal(preview.fixedFee, "8");
  assert.equal(preview.customsCost, "0");
  assert.equal(preview.weightKg, "0.5");
  assert.equal(preview.weightSource, "CATALOG_ESTIMATE");
  assert.equal(preview.isProvisional, false);
  assert.equal(preview.notice, null);
  assert.equal(preview.currency, "USD");
  assert.equal(preview.imageUrl, "https://img.shein.com/1.jpg");
  assert.equal(preview.productName, "Robe fleurie");

  const t = verifyQuotePreviewTicket(ticket);
  assert.equal(t.productPrice, "20");
  assert.equal(t.weightKg, "0.5");
  assert.equal(t.subCategoryId, sub.id);
  assert.equal(t.commissionRate, "15");
  assert.equal(t.chinaPricePerKg, "14");
  assert.equal(t.fixedFee, "8");
});

test("Poids inconnu : aperçu PROVISOIRE avec avertissement, jamais présenté comme final", async () => {
  await creerReglages();
  const sub = await creerSousCategorie();

  const { preview, ticket } = await previewInternationalQuote(
    { productUrl: URL_OK, subCategoryId: sub.id },
    { gate: nouvelleGate(), fetchProduct: espion().fetchProduct }
  );

  assert.equal(preview.isProvisional, true);
  assert.equal(preview.status, "PENDING_REVIEW");
  assert.equal(preview.shippingCost, "0");
  assert.equal(preview.weightKg, null);
  assert.equal(preview.weightSource, null);
  assert.match(preview.notice ?? "", /provisoire/);
  assert.equal(verifyQuotePreviewTicket(ticket).weightKg, null);
});

test("Poids extrait de 0,275 kg : normalisé à 0,28 avant le calcul", async () => {
  await creerReglages();
  const sub = await creerSousCategorie();

  const { preview } = await previewInternationalQuote(
    { productUrl: URL_OK, subCategoryId: sub.id },
    { gate: nouvelleGate(), fetchProduct: espion(produit({ weightKg: 0.275 })).fetchProduct }
  );

  assert.equal(preview.weightKg, "0.28");
  assert.equal(preview.weightSource, "EXTRACTED");
  assert.equal(preview.shippingCost, "3.92");
  assert.equal(preview.totalPrice, "34.92");
});

test("Les taux du ticket sont ceux de la base AU MOMENT de l'aperçu", async () => {
  await creerReglages({ commission: "10", perKg: "12", fee: "5" });
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const { preview, ticket } = await previewInternationalQuote(
    { productUrl: URL_OK, subCategoryId: sub.id },
    { gate: nouvelleGate(), fetchProduct: espion().fetchProduct }
  );

  assert.equal(preview.totalPrice, "33"); // 20 + 6 + 2 + 5
  assert.equal(verifyQuotePreviewTicket(ticket).chinaPricePerKg, "12");
});

test("L'aperçu n'ÉCRIT RIEN en base (aucun devis, utilisateur, panier ni commande)", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  await previewInternationalQuote(
    { productUrl: URL_OK, subCategoryId: sub.id },
    { gate: nouvelleGate(), fetchProduct: espion().fetchProduct }
  );

  assert.equal(await prisma.internationalQuote.count(), 0);
  assert.equal(await prisma.user.count(), 0);
  assert.equal(await prisma.cart.count(), 0);
  assert.equal(await prisma.order.count(), 0);
  assert.equal(await prisma.quoteRevision.count(), 0);
});

// =============== Validations (avant tout appel payant) ===============

test("Lien non pris en charge / piégé : refusé AVANT toute extraction", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { fetchProduct, appels } = espion();

  for (const url of [
    "https://shein.com.evil.com/x",
    "https://shein.com@evil.com/x",
    "https://www.amazon.com/dp/1",
    "http://169.254.169.254/",
    "",
    42,
    null,
    undefined,
  ]) {
    await assert.rejects(
      previewInternationalQuote({ productUrl: url, subCategoryId: sub.id }, { gate: nouvelleGate(), fetchProduct }),
      PreviewInputError,
      String(url)
    );
  }
  assert.equal(appels.length, 0);
});

test("Sous-catégorie absente, inconnue, inactive ou démesurée : refusée AVANT extraction", async () => {
  await creerReglages();
  const inactive = await creerSousCategorie({ weightKg: "1", active: false });
  const { fetchProduct, appels } = espion();

  for (const sub of [undefined, null, "", 42, "inexistante", inactive.id, "x".repeat(101)]) {
    await assert.rejects(
      previewInternationalQuote({ productUrl: URL_OK, subCategoryId: sub }, { gate: nouvelleGate(), fetchProduct }),
      PreviewInputError,
      String(sub)
    );
  }
  assert.equal(appels.length, 0);
});

test("NOON en AED : conversion USD et métadonnées conservées dans le ticket", async () => {
  await creerReglages({ aedToUsdRate: "0.5" });
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const noonProduct = produit({
    source: "NOON",
    url: "https://www.noon.com/uae-en/product/N12345678V/p/",
    name: "Produit NOON",
    price: 100,
    currency: "AED",
  });

  const { preview, ticket } = await previewInternationalQuote(
    {
      productUrl: noonProduct.url,
      subCategoryId: sub.id,
    },
    {
      gate: nouvelleGate(),
      fetchProduct: espion(noonProduct).fetchProduct,
    }
  );

  assert.equal(preview.currency, "USD");
  assert.equal(preview.productPrice, "50");
  assert.equal(preview.shippingCost, "7");
  assert.equal(preview.commissionCost, "7.5");
  assert.equal(preview.fixedFee, "8");
  assert.equal(preview.totalPrice, "72.5");

  const verified = verifyQuotePreviewTicket(ticket);

  assert.equal(verified.productPrice, "50");
  assert.equal(verified.sourceProductPrice, "100.00");
  assert.equal(verified.sourceCurrency, "AED");
  assert.equal(verified.exchangeRate, "0.5");
});

test("NOON en AED sans taux configuré : refusé", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const noonProduct = produit({
    source: "NOON",
    url: "https://www.noon.com/uae-en/product/N12345678V/p/",
    price: 100,
    currency: "AED",
  });

  await assert.rejects(
    previewInternationalQuote(
      {
        productUrl: noonProduct.url,
        subCategoryId: sub.id,
      },
      {
        gate: nouvelleGate(),
        fetchProduct: espion(noonProduct).fetchProduct,
      }
    ),
    /taux de conversion/i
  );
});

test("1688 en CNY : conversion USD, poids maximal extrait et métadonnées conservées", async () => {
  await creerReglages({ cnyToUsdRate: "0.1" });
  const sub = await creerSousCategorie();

  const product1688 = produit({
    source: "1688",
    url: "https://detail.1688.com/offer/900656100526.html",
    name: "Produit 1688",
    price: 100,
    currency: "CNY",
    weightKg: 11,
    weightKgMin: 11,
    weightKgMax: 18,
  });

  const { preview, ticket } = await previewInternationalQuote(
    {
      productUrl: product1688.url,
      subCategoryId: sub.id,
    },
    {
      gate: nouvelleGate(),
      fetchProduct: espion(product1688).fetchProduct,
    }
  );

  assert.equal(preview.currency, "USD");
  assert.equal(preview.productPrice, "10");
  assert.equal(preview.weightKg, "18");
  assert.equal(preview.weightSource, "EXTRACTED");
  assert.equal(preview.shippingCost, "252");
  assert.equal(preview.commissionCost, "1.5");
  assert.equal(preview.fixedFee, "8");
  assert.equal(preview.totalPrice, "271.5");

  const verified = verifyQuotePreviewTicket(ticket);

  assert.equal(verified.productPrice, "10");
  assert.equal(verified.sourceProductPrice, "100.00");
  assert.equal(verified.sourceCurrency, "CNY");
  assert.equal(verified.exchangeRate, "0.1");
  assert.equal(verified.weightKg, "18");
});


test("1688 sans poids maximal extrait : utilise le poids du catalogue", async () => {
  await creerReglages({ cnyToUsdRate: "0.1" });
  const sub = await creerSousCategorie({ weightKg: "2.5" });

  const product1688 = produit({
    source: "1688",
    url: "https://detail.1688.com/offer/900656100526.html",
    price: 100,
    currency: "CNY",
    weightKg: undefined,
    weightKgMin: 11,
    weightKgMax: undefined,
  });

  const { preview, ticket } = await previewInternationalQuote(
    {
      productUrl: product1688.url,
      subCategoryId: sub.id,
    },
    {
      gate: nouvelleGate(),
      fetchProduct: espion(product1688).fetchProduct,
    }
  );

  assert.equal(preview.weightKg, "2.5");
  assert.equal(preview.weightSource, "CATALOG_ESTIMATE");
  assert.equal(preview.shippingCost, "35");
  assert.equal(preview.isProvisional, false);
  assert.equal(verifyQuotePreviewTicket(ticket).weightKg, "2.5");
});

test("1688 sans poids extrait ni poids catalogue : aperçu provisoire", async () => {
  await creerReglages({ cnyToUsdRate: "0.1" });
  const sub = await creerSousCategorie();

  const product1688 = produit({
    source: "1688",
    url: "https://detail.1688.com/offer/900656100526.html",
    price: 100,
    currency: "CNY",
    weightKg: undefined,
    weightKgMin: undefined,
    weightKgMax: undefined,
  });

  const { preview, ticket } = await previewInternationalQuote(
    {
      productUrl: product1688.url,
      subCategoryId: sub.id,
    },
    {
      gate: nouvelleGate(),
      fetchProduct: espion(product1688).fetchProduct,
    }
  );

  assert.equal(preview.weightKg, null);
  assert.equal(preview.weightSource, null);
  assert.equal(preview.shippingCost, "0");
  assert.equal(preview.isProvisional, true);
  assert.equal(preview.status, "PENDING_REVIEW");
  assert.match(preview.notice ?? "", /provisoire/i);
  assert.equal(verifyQuotePreviewTicket(ticket).weightKg, null);
});

test("1688 en CNY sans taux configuré : refusé", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const product1688 = produit({
    source: "1688",
    url: "https://detail.1688.com/offer/900656100526.html",
    price: 100,
    currency: "CNY",
  });

  await assert.rejects(
    previewInternationalQuote(
      {
        productUrl: product1688.url,
        subCategoryId: sub.id,
      },
      {
        gate: nouvelleGate(),
        fetchProduct: espion(product1688).fetchProduct,
      }
    ),
    /taux de conversion/i
  );
});

test("1688 en CNY avec taux invalide : refusé", async () => {
  for (const rate of ["0", "-0.5", "11"]) {
    await resetTestDb();
    await creerReglages({ cnyToUsdRate: rate });
    const sub = await creerSousCategorie({ weightKg: "0.5" });

    const product1688 = produit({
      source: "1688",
      url: "https://detail.1688.com/offer/900656100526.html",
      price: 100,
      currency: "CNY",
    });

    await assert.rejects(
      previewInternationalQuote(
        {
          productUrl: product1688.url,
          subCategoryId: sub.id,
        },
        {
          gate: nouvelleGate(),
          fetchProduct: espion(product1688).fetchProduct,
        }
      ),
      /taux de conversion/i
    );
  }
});

test("Devises non prises en charge : refusées", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  for (const currency of ["EUR", "CDF", "", "usd2"]) {
    await assert.rejects(
      previewInternationalQuote(
        { productUrl: URL_OK, subCategoryId: sub.id },
        {
          gate: nouvelleGate(),
          fetchProduct: espion(produit({ currency })).fetchProduct,
        }
      ),
      /devise/i,
      currency
    );
  }
});

test("Devise 'usd' en minuscules acceptée", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  const { preview } = await previewInternationalQuote(
    { productUrl: URL_OK, subCategoryId: sub.id },
    { gate: nouvelleGate(), fetchProduct: espion(produit({ currency: "usd" })).fetchProduct }
  );

  assert.equal(preview.totalPrice, "38");
});

test("Prix extrait invalide (0, négatif, NaN, texte) : refusé", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  for (const price of [0, -3, NaN, Infinity, "abc" as unknown as number]) {
    await assert.rejects(
      previewInternationalQuote(
        { productUrl: URL_OK, subCategoryId: sub.id },
        { gate: nouvelleGate(), fetchProduct: espion(produit({ price })).fetchProduct }
      ),
      /prix/i,
      String(price)
    );
  }
});

test("Sans réglages en base : erreur, aucun appel payant", async () => {
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { fetchProduct, appels } = espion();

  await assert.rejects(
    previewInternationalQuote({ productUrl: URL_OK, subCategoryId: sub.id }, { gate: nouvelleGate(), fetchProduct }),
    /Configuration système introuvable/
  );
  assert.equal(appels.length, 0);
});

test("Échec d'extraction : message générique, le détail interne n'est jamais exposé", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });

  await assert.rejects(
    previewInternationalQuote(
      { productUrl: URL_OK, subCategoryId: sub.id },
      {
        gate: nouvelleGate(),
        fetchProduct: async () => {
          throw new Error("Apify token=SECRET_APIFY_DETAIL invalid");
        },
      }
    ),
    (e: Error) => e instanceof PreviewInputError && !e.message.includes("SECRET_APIFY_DETAIL")
  );
});

// =============== Garde-fou des coûts (cache, budget, doublons) ===============

test("Même lien demandé deux fois : UNE seule extraction (cache)", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { fetchProduct, appels } = espion();
  const gate = nouvelleGate();

  await previewInternationalQuote({ productUrl: URL_OK, subCategoryId: sub.id }, { gate, fetchProduct });
  await previewInternationalQuote({ productUrl: URL_OK, subCategoryId: sub.id }, { gate, fetchProduct });

  assert.equal(appels.length, 1);
});

test("Deux liens différents : deux extractions", async () => {
  await creerReglages();
  const sub = await creerSousCategorie({ weightKg: "0.5" });
  const { fetchProduct, appels } = espion();
  const gate = nouvelleGate();

  await previewInternationalQuote({ productUrl: URL_OK, subCategoryId: sub.id }, { gate, fetchProduct });
  await previewInternationalQuote({ productUrl: "https://www.shein.com/Autre-p-2.html", subCategoryId: sub.id }, { gate, fetchProduct });

  assert.equal(appels.length, 2);
});

test("Le cache expire au bout de la durée prévue (horloge simulée)", async () => {
  const urls: string[] = [];
  let maintenant = Date.UTC(2026, 9, 18, 10, 0, 0);
  const gate = new ExtractionGate({ ttlMs: 3_600_000, maxEntries: 500, dailyBudget: 300 }, () => maintenant);
  const fetcher = async (u: string) => (urls.push(u), produit());

  await gate.get(URL_OK, fetcher);
  maintenant += 3_599_000;
  await gate.get(URL_OK, fetcher);
  assert.equal(urls.length, 1);

  maintenant += 2_000; // 3 601 s au total
  await gate.get(URL_OK, fetcher);
  assert.equal(urls.length, 2);
});

test("Demandes SIMULTANÉES pour le même lien : une seule extraction partagée", async () => {
  const gate = nouvelleGate();
  let n = 0;
  const fetcher = async () => {
    n++;
    await new Promise((r) => setTimeout(r, 30));
    return produit();
  };

  const r = await Promise.all([gate.get(URL_OK, fetcher), gate.get(URL_OK, fetcher), gate.get(URL_OK, fetcher)]);

  assert.equal(n, 1);
  assert.equal(r[0], r[2]);
});

test("Budget quotidien épuisé : refus (ExtractionBudgetExceededError), mais le cache reste servi", async () => {
  const gate = nouvelleGate({ dailyBudget: 2 });
  const f = async () => produit();

  await gate.get("https://www.shein.com/a", f);
  await gate.get("https://www.shein.com/b", f);

  await assert.rejects(gate.get("https://www.shein.com/c", f), (e: Error) => e.name === "ExtractionBudgetExceededError");
  await assert.doesNotReject(gate.get("https://www.shein.com/a", f)); // en cache : gratuit
});

test("Le budget se renouvelle le jour suivant", async () => {
  let maintenant = Date.UTC(2026, 9, 18, 23, 0, 0);
  const gate = new ExtractionGate({ ttlMs: 1, maxEntries: 500, dailyBudget: 1 }, () => maintenant);
  const f = async () => produit();

  await gate.get("https://www.shein.com/a", f);
  await assert.rejects(gate.get("https://www.shein.com/b", f), (e: Error) => e.name === "ExtractionBudgetExceededError");

  maintenant += 2 * 3600 * 1000; // lendemain
  await assert.doesNotReject(gate.get("https://www.shein.com/b", f));
});

test("Une extraction qui ÉCHOUE consomme quand même le budget et n'est pas mise en cache", async () => {
  const gate = nouvelleGate({ dailyBudget: 2 });
  let n = 0;
  const ko = async () => {
    n++;
    throw new Error("boom");
  };

  await assert.rejects(gate.get("https://www.shein.com/a", ko));
  await assert.rejects(gate.get("https://www.shein.com/a", ko)); // pas de cache : nouvel essai
  assert.equal(n, 2);
  await assert.rejects(gate.get("https://www.shein.com/a", ko), (e: Error) => e.name === "ExtractionBudgetExceededError");
});

test("Cache borné : les plus anciennes entrées sont évincées", async () => {
  const gate = nouvelleGate({ maxEntries: 2 });
  const urls: string[] = [];
  const f = async (u: string) => (urls.push(u), produit());

  await gate.get("https://www.shein.com/1", f);
  await gate.get("https://www.shein.com/2", f);
  await gate.get("https://www.shein.com/3", f); // évince /1
  await gate.get("https://www.shein.com/1", f); // doit être ré-extrait

  assert.equal(urls.filter((u) => u.endsWith("/1")).length, 2);
});



test("NOON en AED avec taux invalide : refusé", async () => {
  for (const rate of ["0", "-0.5", "11"]) {
    await resetTestDb();
    await creerReglages({ aedToUsdRate: rate });
    const sub = await creerSousCategorie({ weightKg: "0.5" });

    const noonProduct = produit({
      source: "NOON",
      url: "https://www.noon.com/uae-en/product/N12345678V/p/",
      price: 100,
      currency: "AED",
    });

    await assert.rejects(
      previewInternationalQuote(
        {
          productUrl: noonProduct.url,
          subCategoryId: sub.id,
        },
        {
          gate: nouvelleGate(),
          fetchProduct: espion(noonProduct).fetchProduct,
        }
      ),
      /taux de conversion/i
    );
  }
});