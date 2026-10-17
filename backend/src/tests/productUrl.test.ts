import "./setup";

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSupportedProductUrl } from "../services/productUrl";
import { SheinProvider } from "../services/providers/shein.provider";

const ACCEPTEES = [
  "https://www.shein.com/Some-Product-p-123.html",
  "https://shein.com/x",
  "https://fr.shein.com/x-p-1.html",
  "https://m.shein.com/x",
  "https://onelink.shein.com/abc",
  "http://www.shein.com/x",
  "HTTPS://WWW.SHEIN.COM/X",
];

const REFUSEES = [
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

for (const url of ACCEPTEES) {
  test(`URL acceptée : ${url}`, () => {
    assert.doesNotThrow(() => parseSupportedProductUrl(url));
    assert.equal(new SheinProvider().supports(url), true);
  });
}

for (const url of REFUSEES) {
  test(`URL refusée : "${url}"`, () => {
    assert.throws(() => parseSupportedProductUrl(url));
    assert.equal(new SheinProvider().supports(url), false);
  });
}

test("Sites sans fournisseur réel : refusés avec un message honnête", () => {
  for (const url of [
    "https://www.amazon.com/dp/123",
    "https://www.alibaba.com/product-detail/x",
    "https://www.pinduoduo.com/x",
    "https://item.taobao.com/x",
  ]) {
    assert.throws(() => parseSupportedProductUrl(url), /pas encore pris en charge/);
  }
});

test("Types inattendus et URL démesurée refusés", () => {
  for (const v of [null, undefined, 42, {}, ["https://shein.com"]]) {
    assert.throws(() => parseSupportedProductUrl(v));
  }
  assert.throws(() => parseSupportedProductUrl("https://shein.com/" + "a".repeat(2100)));
});

test("L'URL normalisée est renvoyée (espaces retirés)", () => {
  const u = parseSupportedProductUrl("  https://www.shein.com/x  ");
  assert.equal(u.href, "https://www.shein.com/x");
});