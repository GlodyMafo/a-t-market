import "dotenv/config";

import { fetchSheinProduct } from "./sheinProduct.service";

async function main() {
  const productId = "238675201";

  console.log(
    `Recherche du produit SHEIN ${productId}...`
  );

  const product = await fetchSheinProduct(productId);

  console.log("\n===== PRODUIT =====");

  console.log("ID :", product.productId);
  console.log("Nom :", product.name);

  console.log("\n===== TAILLES =====");

  console.dir(product.sizeOptions, {
    depth: null,
  });

  console.log("\n===== CONVERSIONS =====");

  console.dir(product.sizeConversions, {
    depth: null,
  });

  console.log("\n===== SIZE CHART =====");

  console.dir(product.sizeChart, {
    depth: null,
  });

  console.log("\n===== FIT =====");

  console.dir(product.fit, {
    depth: null,
  });
}

main().catch((error) => {
  console.error(
    "\nErreur :",
    error
  );

  process.exit(1);
});