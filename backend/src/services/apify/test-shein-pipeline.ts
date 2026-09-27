import "dotenv/config";

import { NativeEmblemService } from "./nativeEmblem.service";
import { SheinProductService } from "./sheinProduct.service";

async function main() {
/*

* =====================================================
* 1. URL DU PRODUIT
* =====================================================
*
* Pour ce test, nous utilisons une URL SHEIN fixe.
*
* Dans la vraie API A&T Market, cette URL viendra
* du frontend.
  */

const productUrl =
"https://fr.shein.com/VIBEWAVE-Halloween-Light-Gray-American-Vintage-Casual-Home-Crew-Neck-Sweater-Autumn-Winter-Slouchy-Dropped-Shoulder-Loose-Wide-Sleeve-Premium-Knit-Top-p-238675201.html";

/*

* =====================================================
* 2. SERVICES
* =====================================================
  */

const nativeEmblem =
new NativeEmblemService();

const sheinProduct =
new SheinProductService();

/*

* =====================================================
* 3. ACTOR 1 : NATIVE EMBLEM
* =====================================================
*
* RESPONSABILITÉS DE L'ACTOR 1 :
*
* * récupérer le produit à partir de l'URL
* * récupérer le goodsId
* * récupérer le titre
* * récupérer l'URL canonique
* * récupérer le prix
* * récupérer la devise
* * récupérer la catégorie
*
* Le prix et la devise officiels de notre pipeline
* viennent de cet Actor.
  */

console.log(
"\n========================================"
);

console.log(
"ÉTAPE 1 : NATIVE EMBLEM"
);

console.log(
"========================================"
);

const nativeProduct =
await nativeEmblem.fetchProduct(
productUrl
);

console.log(
"\n===== RÉSULTAT NATIVE EMBLEM ====="
);

console.log(
"Goods ID :",
nativeProduct.goodsId
);

console.log(
"Titre :",
nativeProduct.title
);

console.log(
"URL :",
nativeProduct.productUrl
);

console.log(
"Prix :",
nativeProduct.price
);

console.log(
"Devise :",
nativeProduct.currency
);

console.log(
"Catégorie :",
nativeProduct.category
);

/*

* =====================================================
* 4. ID AUTOMATIQUE
* =====================================================
*
* IMPORTANT :
*
* L'ID du deuxième Actor vient directement
* du résultat du premier Actor.
*
* Nous ne faisons PAS :
*
* const productId = "238675201";
  */

const productId =
nativeProduct.goodsId;

console.log(
"\n========================================"
);

console.log(
"ID TRANSMIS AU DEUXIÈME ACTOR :",
productId
);

console.log(
"========================================"
);

/*

* =====================================================
* 5. ACTOR 2 : SHEIN PRODUCT SCRAPER
* =====================================================
*
* RESPONSABILITÉS DE L'ACTOR 2 :
*
* L'Actor 2 reçoit UNIQUEMENT le goodsId.
*
* Il sert à enrichir le produit avec :
*
* * images
* * couleurs
* * tailles
* * conversions
* * size chart
* * fit
* * attributs
* * disponibilité
*
* Il ne remplace PAS le prix récupéré par
* Native Emblem.
  */

const detailedProduct =
await sheinProduct.fetchProductById(
productId
);

/*

* =====================================================
* 6. RÉSULTAT FINAL
* =====================================================
*
* IMPORTANT :
*
* Les données générales viennent de Native Emblem.
*
* Les données détaillées viennent du deuxième Actor.
  */

console.log(
"\n========================================"
);

console.log(
"ÉTAPE 2 : SHEIN PRODUCT SCRAPER"
);

console.log(
"========================================"
);

console.log(
"\n===== PRODUIT ====="
);

/*

* ID
* ---
* On utilise l'ID du premier Actor.
  */

console.log(
"ID :",
nativeProduct.goodsId
);

/*

* NOM
* ---
* On utilise le titre du premier Actor.
  */

console.log(
"Nom :",
nativeProduct.title
);

/*

* PRIX
* ---
* IMPORTANT :
*
* Le prix vient du PREMIER ACTOR.
*
* On ne fait PAS :
*
* detailedProduct["price.current"]
  */

console.log(
"Prix :",
nativeProduct.price
);

/*

* DEVISE
* ---
* IMPORTANT :
*
* La devise vient également du PREMIER ACTOR.
  */

console.log(
"Devise :",
nativeProduct.currency
);

/*

* URL
* ---

*/

console.log(
"URL :",
nativeProduct.productUrl
);

/*

* CATÉGORIE
* ---

*/

console.log(
"Catégorie :",
nativeProduct.category
);

/*

* DISPONIBILITÉ
* ---
* Cette information vient du deuxième Actor.
  */

console.log(
"En stock :",
detailedProduct.inStock
);

/*

* =====================================================
* 7. IMAGES
* =====================================================
  */

console.log(
"\n===== IMAGES ====="
);

console.dir(
detailedProduct.images,
{ depth: null }
);

/*

* =====================================================
* 8. COULEURS
* =====================================================
  */

console.log(
"\n===== COULEURS ====="
);

console.dir(
detailedProduct.colors,
{ depth: null }
);

/*

* =====================================================
* 9. TAILLES
* =====================================================
  */

console.log(
"\n===== TAILLES ====="
);

console.dir(
detailedProduct.sizeOptions,
{ depth: null }
);

/*

* =====================================================
* 10. CONVERSIONS
* =====================================================
  */

console.log(
"\n===== CONVERSIONS ====="
);

console.dir(
detailedProduct.sizeConversions,
{ depth: null }
);

/*

* =====================================================
* 11. SIZE CHART
* =====================================================
  */

console.log(
"\n===== SIZE CHART ====="
);

console.dir(
detailedProduct.sizeChart,
{ depth: null }
);

/*

* =====================================================
* 12. FIT
* =====================================================
  */

console.log(
"\n===== FIT ====="
);

console.dir(
detailedProduct.fit,
{ depth: null }
);

/*

* =====================================================
* 13. ATTRIBUTS
* =====================================================
  */

console.log(
"\n===== ATTRIBUTS ====="
);

console.dir(
detailedProduct.attributes,
{ depth: null }
);

/*

* =====================================================
* 14. RÉSUMÉ DU PIPELINE
* =====================================================
  */

console.log(
"\n========================================"
);

console.log(
"RÉSUMÉ DU PIPELINE"
);

console.log(
"========================================"
);

console.log(
"URL          :",
nativeProduct.productUrl
);

console.log(
"Goods ID     :",
nativeProduct.goodsId
);

console.log(
"Nom          :",
nativeProduct.title
);

console.log(
"Prix         :",
nativeProduct.price
);

console.log(
"Devise       :",
nativeProduct.currency
);

console.log(
"Catégorie    :",
nativeProduct.category
);

console.log(
  "Images       :",
  Array.isArray(detailedProduct.images)
    ? detailedProduct.images.length
    : 0
);

console.log(
"En stock     :",
detailedProduct.inStock
);

console.log(
"\n========================================"
);

console.log(
"✅ PIPELINE SHEIN TERMINÉ"
);

console.log(
"========================================"
);

console.log(
`URL → Native Emblem → ${productId} → Shein Product Scraper`
);
}

main().catch((error) => {
console.error(
"\n========================================"
);

console.error(
"❌ ERREUR PIPELINE"
);

console.error(
"========================================"
);

console.error(error);

process.exit(1);
});
