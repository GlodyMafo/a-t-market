
import "./setup";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectProductMarketplace,
  parseSupportedProductUrl,
} from "../services/productUrl";

import { SheinProvider } from "../services/providers/shein.provider";

const sheinProvider = new SheinProvider();

const URLS_SHEIN_ACCEPTEES = [
  "https://www.shein.com/Some-Product-p-123.html",
  "https://shein.com/x",
  "https://fr.shein.com/x-p-1.html",
  "https://m.shein.com/x",
];

const URLS_SHEIN_REFUSEES = [
  "https://shein.com.evil.com/x",
  "https://evilshein.com/x",
  "https://notshein.com/x",
  "https://evil.com/?u=shein.com",
  "https://evil.com/shein.com",
  "https://shein.com@evil.com/x",
  "https://user:pass@shein.com/x",
  "https://shein.com:8080/x",
  "https://shein.com.cn.evil.io",
  "ftp://www.shein.com/x",
  "javascript:alert(1)",
  "file:///etc/passwd",
  "http://127.0.0.1/shein.com",
  "http://localhost/shein.com",
  "http://169.254.169.254/latest/meta-data/",
  "shein.com/x",
  "www.shein.com",
  "",
  "   ",
];

for (const url of URLS_SHEIN_ACCEPTEES) {
  test(`URL SHEIN acceptée : ${url}`, () => {
    assert.doesNotThrow(() => parseSupportedProductUrl(url));
    assert.equal(sheinProvider.supports(url), true);
  });
}

for (const url of URLS_SHEIN_REFUSEES) {
  test(`URL refusée : "${url}"`, () => {
    assert.throws(() => parseSupportedProductUrl(url));
    assert.equal(sheinProvider.supports(url), false);
  });
}

test("NOON est pris en charge et 1688 reste refusé", () => {
  const noonUrl =
    "https://www.noon.com/en-sa/N24242330A/p/?o=f4c464480c57e15a";

  assert.equal(
    detectProductMarketplace(noonUrl),
    "NOON"
  );

  assert.equal(
    parseSupportedProductUrl(noonUrl).hostname,
    "www.noon.com"
  );

  const urls1688 = [
    "https://www.1688.com/",
    "https://detail.1688.com/offer/123456.html",
  ];

  for (const url of urls1688) {
    assert.equal(
      detectProductMarketplace(url),
      "1688"
    );

    assert.throws(
      () => parseSupportedProductUrl(url),
      /pas encore pris en charge/
    );
  }
});

test("Sites sans fournisseur réel restent refusés", () => {
  for (const url of [
    "https://www.amazon.com/dp/123",
    "https://www.alibaba.com/product-detail/x",
    "https://www.pinduoduo.com/x",
    "https://item.taobao.com/x",
  ]) {
    assert.throws(
      () => parseSupportedProductUrl(url),
      /pas encore pris en charge/
    );
  }
});

test("Types inattendus et URL démesurée refusés", () => {
  for (const value of [
    null,
    undefined,
    42,
    {},
    ["https://shein.com"],
  ]) {
    assert.throws(() => parseSupportedProductUrl(value));
  }

  assert.throws(() =>
    parseSupportedProductUrl(
      "https://shein.com/" + "a".repeat(2100)
    )
  );
});

test("L'URL normalisée est renvoyée (espaces retirés)", () => {
  const url = parseSupportedProductUrl(
    "  https://www.shein.com/x  "
  );

  assert.equal(url.href, "https://www.shein.com/x");
});

test("Les liens directs sont associés à leur marketplace", () => {
  assert.equal(
    detectProductMarketplace(
      "https://www.shein.com/product-p-123.html"
    ),
    "SHEIN"
  );

  assert.equal(
    detectProductMarketplace(
      "https://www.noon.com/en-sa/N24242330A/p/"
    ),
    "NOON"
  );

  assert.equal(
    detectProductMarketplace(
      "https://detail.1688.com/offer/123456.html"
    ),
    "1688"
  );
});

test("Les liens courts connus sont associés à leur marketplace", () => {
  assert.equal(
    detectProductMarketplace(
      "https://onelink.shein.com/58/66nfze2i7epe"
    ),
    "SHEIN"
  );

  assert.equal(
    detectProductMarketplace(
      "https://qr.1688.com/s/PFiACVoe"
    ),
    "1688"
  );
});

test("Les domaines inconnus restent refusés", () => {
  assert.throws(() =>
    detectProductMarketplace("https://evil.com/?url=shein.com")
  );
});
