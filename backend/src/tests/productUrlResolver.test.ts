
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ProductUrlResolver,
  ProductUrlResolverError,
  inspectProductUrl,
  type UrlResolverTransport,
  type UrlHopResponse,
} from "../services/productUrlResolver";

function createTransport(
  responses: UrlHopResponse[]
): UrlResolverTransport {
  let index = 0;

  return {
    async request(): Promise<UrlHopResponse> {
      const response = responses[index];

      if (!response) {
        throw new Error("Aucune réponse simulée disponible.");
      }

      index += 1;
      return response;
    },
  };
}

function response(
  statusCode: number,
  location?: string
): UrlHopResponse {
  return {
    statusCode,
    headers: location ? { location } : {},
  };
}

// --------------------------------------------------
// Inspection des URL
// --------------------------------------------------

test("Inspection : lien direct SHEIN reconnu", () => {
  const result = inspectProductUrl(
    "https://www.shein.com/product-p-123.html"
  );

  assert.equal(result.marketplace, "SHEIN");
  assert.equal(result.isShortLink, false);
});

test("Inspection : lien court SHEIN reconnu", () => {
  const result = inspectProductUrl(
    "https://onelink.shein.com/58/66nfze2i7epe"
  );

  assert.equal(result.marketplace, "SHEIN");
  assert.equal(result.isShortLink, true);
});

test("Inspection : lien direct NOON reconnu", () => {
  const result = inspectProductUrl(
    "https://www.noon.com/uae-en/product/N70167848V/p/"
  );

  assert.equal(result.marketplace, "NOON");
  assert.equal(result.isShortLink, false);
});

test("Inspection : URL invalide refusée", () => {
  for (const value of [
    null,
    undefined,
    42,
    "",
    "   ",
    "https://evil.com/product",
    "http://www.shein.com/product",
    "https://user:pass@www.shein.com/product",
    "https://www.shein.com:8080/product",
  ]) {
    assert.throws(() => inspectProductUrl(value));
  }
});

test("Inspection : fragment supprimé", () => {
  const result = inspectProductUrl(
    "https://www.shein.com/product-p-123.html#details"
  );

  assert.equal(
    result.url.href,
    "https://www.shein.com/product-p-123.html"
  );
});

// --------------------------------------------------
// Résolution des redirections
// --------------------------------------------------

test("Résolution : URL directe sans redirection", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(200),
    ]),
  });

  const result = await resolver.resolve(
    "https://www.shein.com/product-p-123.html"
  );

  assert.equal(result.marketplace, "SHEIN");
  assert.equal(
    result.originalUrl,
    "https://www.shein.com/product-p-123.html"
  );
  assert.equal(
    result.canonicalUrl,
    "https://www.shein.com/product-p-123.html"
  );
  assert.equal(result.redirectCount, 0);
});

test("Résolution : redirection absolue vers URL canonique", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(
        302,
        "https://www.shein.com/product-p-456.html"
      ),
      response(200),
    ]),
  });

  const result = await resolver.resolve(
    "https://onelink.shein.com/58/abc123"
  );

  assert.equal(result.marketplace, "SHEIN");
  assert.equal(
    result.canonicalUrl,
    "https://www.shein.com/product-p-456.html"
  );
  assert.equal(result.redirectCount, 1);
});

test("Résolution : redirection relative acceptée", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(301, "/uae-en/product/N70167848V/p/"),
      response(200),
    ]),
  });

  const result = await resolver.resolve(
    "https://www.noon.com/short-link"
  );

  assert.equal(
    result.canonicalUrl,
    "https://www.noon.com/uae-en/product/N70167848V/p/"
  );
  assert.equal(result.redirectCount, 1);
});

test("Résolution : plusieurs redirections autorisées", async () => {
  const resolver = new ProductUrlResolver({
    maxRedirects: 3,
    transport: createTransport([
      response(301, "https://www.shein.com/step-2"),
      response(302, "https://www.shein.com/step-3"),
      response(200),
    ]),
  });

  const result = await resolver.resolve(
    "https://onelink.shein.com/start"
  );

  assert.equal(result.redirectCount, 2);
  assert.equal(
    result.canonicalUrl,
    "https://www.shein.com/step-3"
  );
});

// --------------------------------------------------
// Sécurité des redirections
// --------------------------------------------------

test("Sécurité : redirection vers domaine externe refusée", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(302, "https://evil.com/steal"),
    ]),
  });

  await assert.rejects(
    () => resolver.resolve("https://www.shein.com/product"),
    ProductUrlResolverError
  );
});

test("Sécurité : redirection HTTP refusée", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(302, "http://www.shein.com/product"),
    ]),
  });

  await assert.rejects(
    () => resolver.resolve("https://www.shein.com/product"),
    /non HTTPS/
  );
});

test("Sécurité : redirection vers une autre marketplace refusée", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(302, "https://www.noon.com/product"),
    ]),
  });

  await assert.rejects(
    () => resolver.resolve("https://www.shein.com/product"),
    /autre marketplace/
  );
});

test("Sécurité : identifiants dans une redirection refusés", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(302, "https://user:pass@www.shein.com/product"),
    ]),
  });

  await assert.rejects(
    () => resolver.resolve("https://www.shein.com/product"),
    /Identifiants interdits/
  );
});

test("Sécurité : port non autorisé dans une redirection refusé", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(302, "https://www.shein.com:8443/product"),
    ]),
  });

  await assert.rejects(
    () => resolver.resolve("https://www.shein.com/product"),
    /Port interdit/
  );
});

// --------------------------------------------------
// Gestion des erreurs HTTP
// --------------------------------------------------

test("HTTP : réponse 404 refusée", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(404),
    ]),
  });

  await assert.rejects(
    () => resolver.resolve("https://www.shein.com/product"),
    /404/
  );
});

test("HTTP : redirection sans destination refusée", async () => {
  const resolver = new ProductUrlResolver({
    transport: createTransport([
      response(302),
    ]),
  });

  await assert.rejects(
    () => resolver.resolve("https://www.shein.com/product"),
    /sans destination/
  );
});

test("HTTP : nombre maximal de redirections respecté", async () => {
  const resolver = new ProductUrlResolver({
    maxRedirects: 1,
    transport: createTransport([
      response(302, "https://www.shein.com/step-2"),
      response(302, "https://www.shein.com/step-3"),
    ]),
  });

  await assert.rejects(
    () => resolver.resolve("https://www.shein.com/product"),
    /Nombre maximal de redirections/
  );
});

test("HTTP : erreur de transport propagée", async () => {
  const transport: UrlResolverTransport = {
    async request() {
      throw new Error("Erreur réseau simulée");
    },
  };

  const resolver = new ProductUrlResolver({ transport });

  await assert.rejects(
    () => resolver.resolve("https://www.shein.com/product"),
    /Erreur réseau simulée/
  );
});
