import "dotenv/config";

import { NativeEmblemService } from "./nativeEmblem.service";

async function main() {
  const service = new NativeEmblemService();

  const product = await service.fetchProduct(
    "https://fr.shein.com/VIBEWAVE-Halloween-Light-Gray-American-Vintage-Casual-Home-Crew-Neck-Sweater-Autumn-Winter-Slouchy-Dropped-Shoulder-Loose-Wide-Sleeve-Premium-Knit-Top-p-238675201.html?imgRatio=3-4&src_identifier=on%3DFLEXIBLE_LAYOUT_COMPONENT%60cn%3Dtoptrends%60hz%3Drefresh_0%60jc%3DtrendsChannel_%60ps%3D3_2_1&src_module=all&src_tab_page_id=page_home1787990386121&detailBusinessFrom=0-2&mallCode=1"
  );

  console.log("\n===== NATIVE EMBLEM =====");
  console.log("Goods ID :", product.goodsId);
  console.log("Titre :", product.title);
  console.log("URL :", product.productUrl);
  console.log("Image :", product.imageUrl);
  console.log("Prix :", product.price);
  console.log("Devise :", product.currency);
  console.log("Catégorie :", product.category);
}

main().catch((error) => {
  console.error("\n❌ ERREUR");
  console.error(error);
  process.exit(1);
});