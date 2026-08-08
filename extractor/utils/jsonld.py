import json
from html import unescape
from schemas.product import  ExtractedProduct


def extract_product_jsonld(page):

    scripts = page.locator(
        'script[type="application/ld+json"]'
    ).all()

    print(f"Nombre de scripts JSON-LD : {len(scripts)}")

    for i, script in enumerate(scripts):

        try:

            content = script.text_content()

            if not content:
                continue

            data = json.loads(content)

            if isinstance(data, list):

                for item in data:

                    if (
                        isinstance(item, dict)
                        and item.get("@type") == "Product"
                    ):

                        item["name"] = unescape(
                            item.get("name", "")
                        )

                        item["description"] = unescape(
                            item.get("description", "")
                        )

                        return item

            elif (
                isinstance(data, dict)
                and data.get("@type") == "Product"
            ):

                data["name"] = unescape(
                    data.get("name", "")
                )

                data["description"] = unescape(
                    data.get("description", "")
                )

                return data

        except Exception as e:
            print(e)

    return None


def map_jsonld_to_extracted_product(
    raw_jsonld: dict, raw_url: str
) -> ExtractedProduct:
    # 1. Traitement des images
    images_list = raw_jsonld.get("images", [])
    if isinstance(raw_jsonld.get("image"), str):
        images_list.insert(0, raw_jsonld.get("image"))

    main_image = images_list[0] if images_list else None
    gallery = images_list[1:] if len(images_list) > 1 else images_list

    # 2. Nettoyage du prix (Conversion en float)
    raw_price = raw_jsonld.get("price")
    price_float = None
    if raw_price:
        try:
            price_float = float(raw_price)
        except ValueError:
            price_float = None

    # 3. Nettoyage de la disponibilité / stock
    raw_avail = raw_jsonld.get("availability", "")
    stock_status = "InStock" if "InStock" in raw_avail else raw_avail

    # 4. Construction de l'URL absolue
    product_url = raw_jsonld.get("url") or raw_url
    if product_url.startswith("//"):
        product_url = "https:" + product_url

    # 5. Nettoyage du titre (Suppression des suffixes Alibaba)
    clean_name = raw_jsonld.get("title") or raw_jsonld.get("name") or ""
    if " - Buy Product on Alibaba.com" in clean_name:
        clean_name = clean_name.replace(
            " - Buy Product on Alibaba.com", ""
        ).strip()

    return ExtractedProduct(
        source="alibaba",
        externalId=str(raw_jsonld.get("sku") or ""),
        productName=unescape(clean_name),
        productPrice=price_float,
        currency=raw_jsonld.get("currency"),
        image=main_image,
        gallery=gallery,
        productUrl=product_url,
        brand=raw_jsonld.get("brand"),
        description=unescape(raw_jsonld.get("description") or ""),
        stock=stock_status,
    )