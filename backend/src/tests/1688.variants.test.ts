import { test } from "node:test";
import assert from "node:assert/strict";

import { map1688Variants } from "../services/apify/1688Product.service";

test("1688 : mappe correctement les trois variantes avec leurs images", () => {
    const variants = map1688Variants([
        {
            skuId: "6079529392919",
            specId: "c0e504597e7401474ec03ca7538c0c39",
            variantEn: "One layer + 2 shelves 90*40*167cm",
            priceCny: 90,
            stock: 9999899,
            image: "https://cbu01.alicdn.com/img/ibank/O1CN01RHqLTu22UODao0q3Y_!!2210040587123-0-cib.jpg",
        },
        {
            skuId: "5754921468018",
            specId: "bd694600dc03bbfe36c3065630ece3c8",
            variantEn: "Single layer 60*40*167cm",
            priceCny: 75,
            stock: 9999999,
            image: "https://cbu01.alicdn.com/img/ibank/O1CN01p3E5rW22UODbd4SZa_!!2210040587123-0-cib.jpg",
        },
        {
            skuId: "6079529392918",
            specId: "14031503c23d03aff8ef780d39106611",
            variantEn: "Two layers + 3 shelves 90*40*167cm",
            priceCny: 115,
            stock: 9999999,
            image: "https://cbu01.alicdn.com/img/ibank/O1CN01gJnWkh22UOFn3K9tV_!!2210040587123-0-cib.jpg",
        },
    ]);

    assert.equal(variants.length, 3);

    assert.deepEqual(
        variants.map((variant) => ({
            sku: variant.sku,
            price: variant.price,
            currency: variant.currency,
            stock: variant.stock,
            inStock: variant.inStock,
            imageUrl: variant.imageUrl,
            attribute: variant.attributes[0]?.value,
        })),
        [
            {
                sku: "6079529392919",
                price: 90,
                currency: "CNY",
                stock: 9999899,
                inStock: true,
                imageUrl: "https://cbu01.alicdn.com/img/ibank/O1CN01RHqLTu22UODao0q3Y_!!2210040587123-0-cib.jpg",
                attribute: "One layer + 2 shelves 90*40*167cm",
            },
            {
                sku: "5754921468018",
                price: 75,
                currency: "CNY",
                stock: 9999999,
                inStock: true,
                imageUrl: "https://cbu01.alicdn.com/img/ibank/O1CN01p3E5rW22UODbd4SZa_!!2210040587123-0-cib.jpg",
                attribute: "Single layer 60*40*167cm",
            },
            {
                sku: "6079529392918",
                price: 115,
                currency: "CNY",
                stock: 9999999,
                inStock: true,
                imageUrl: "https://cbu01.alicdn.com/img/ibank/O1CN01gJnWkh22UOFn3K9tV_!!2210040587123-0-cib.jpg",
                attribute: "Two layers + 3 shelves 90*40*167cm",
            },
        ]
    );
});

test("1688 : ignore les variantes invalides", () => {
    const variants = map1688Variants([
        null,
        {},
        { skuId: 12345 },
        { specId: "valid-spec", priceCny: 75 },
    ]);

    assert.equal(variants.length, 1);
    assert.equal(variants[0].sku, "valid-spec");
});

test("1688 : accepte une variante sans image ni stock", () => {
    const variants = map1688Variants([
        {
            skuId: "sku-without-image",
            variant: "Single layer",
        },
    ]);

    assert.equal(variants.length, 1);
    assert.equal(variants[0].imageUrl, undefined);
    assert.equal(variants[0].stock, undefined);
    assert.equal(variants[0].inStock, true);
});

test("1688 : retourne un tableau vide si les données SKU sont absentes", () => {
    assert.deepEqual(map1688Variants(undefined), []);
    assert.deepEqual(map1688Variants(null), []);
});