import json
from html import unescape
from schemas.product import ExtractedProduct
from services.playwright_service import PlaywrightService
from utils.jsonld import extract_product_jsonld


def extract_alibaba(url: str) -> ExtractedProduct | None:
    service = PlaywrightService()
    try:
        page = service.open(url)
        
        # Attente pour s'assurer que les scripts de la page sont exécutés
        try:
            page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass

        product_jsonld = extract_product_jsonld(page)

        # -------------------------------------------------------------
        # 1. Extraction via les Objets JS Globaux d'Alibaba
        # -------------------------------------------------------------
        categories = []
        colors = []
        sizes = []

        try:
            # Inspection de tous les objets globaux possibles sur Alibaba
            raw_js_data = page.evaluate("""() => {
                return window.__detailData__ 
                    || window.__INITIAL_DATA__ 
                    || window.detailData 
                    || window.__page_data__ 
                    || null;
            }""")

            if raw_js_data and isinstance(raw_js_data, dict):
                # A. Fil d'ariane / Catégories
                bc_list = (
                    raw_js_data.get("globalData", {}).get("header", {}).get("breadcrumb", [])
                    or raw_js_data.get("breadcrumb", [])
                    or raw_js_data.get("product", {}).get("breadcrumb", [])
                )

                for item in bc_list:
                    name = item.get("name") if isinstance(item, dict) else str(item)
                    if name and name.lower() not in ["home", "all categories", "accueil", "toutes les catégories"]:
                        categories.append(name.strip())

                # B. Variantes (Couleurs & Tailles)
                sku_props = (
                    raw_js_data.get("globalData", {}).get("product", {}).get("sku", {}).get("skuProperties", [])
                    or raw_js_data.get("skuProperties", [])
                    or raw_js_data.get("product", {}).get("skuProperties", [])
                )

                for prop in sku_props:
                    prop_name = str(prop.get("name", "")).lower()
                    values = prop.get("value", []) or prop.get("values", [])

                    val_names = []
                    for v in values:
                        val_str = v.get("name") if isinstance(v, dict) else str(v)
                        if val_str:
                            val_names.append(val_str.strip())

                    if any(k in prop_name for k in ["color", "couleur", "shade", "pattern"]):
                        colors.extend(val_names)
                    elif any(k in prop_name for k in ["size", "taille", "dimension", "specification"]):
                        sizes.extend(val_names)
                    else:
                        # Si le nom est ambigu, on tente de dispatcher selon les valeurs
                        for v_str in val_names:
                            if any(char.isdigit() for char in v_str) or "cm" in v_str.lower() or "mm" in v_str.lower():
                                sizes.append(v_str)
                            else:
                                colors.append(v_str)

        except Exception:
            pass

        # -------------------------------------------------------------
        # 2. Fallbacks HTML si le JS global n'a rien renvoyé
        # -------------------------------------------------------------
        
        # Fallback Catégories
        if not categories:
            try:
                bc_elements = page.locator(".breadcrumb-item, .breadcrumb a, [data-keyword='breadcrumb'] a, .ancestor-list a").all_inner_texts()
                categories = [
                    t.strip() for t in bc_elements 
                    if t.strip() and t.strip().lower() not in ["home", "all categories", "accueil", "toutes les catégories", ">"]
                ]
            except Exception:
                pass

        # Fallback Couleurs & Tailles
        if not colors or not sizes:
            try:
                # Récupère tous les blocs de sélection SKU visibles dans le DOM
                sku_items = page.locator(".sku-prop, .sku-item, .attribute-item, .product-prop").all()
                for item in sku_items:
                    text_content = item.inner_text().lower()
                    
                    # Extraire les valeurs à l'intérieur de ce bloc
                    val_elements = item.locator(".sku-value, .value, .attr-val, span, img").all()
                    extracted_vals = []
                    for v in val_elements:
                        val_txt = v.get_attribute("title") or v.get_attribute("alt") or v.inner_text()
                        if val_txt and len(val_txt.strip()) < 30 and val_txt.strip() not in extracted_vals:
                            extracted_vals.append(val_txt.strip())

                    if "color" in text_content or "couleur" in text_content:
                        colors.extend(extracted_vals)
                    elif "size" in text_content or "taille" in text_content:
                        sizes.extend(extracted_vals)
            except Exception:
                pass

    finally:
        service.close()

    if not product_jsonld:
        return None

    # Extraction des données JSON-LD
    offer = product_jsonld.get("offers", {})
    if isinstance(offer, list) and len(offer) > 0:
        offer = offer[0]

    brand_data = product_jsonld.get("brand", {})
    brand_name = (
        brand_data.get("name")
        if isinstance(brand_data, dict)
        else str(brand_data)
        if brand_data
        else None
    )

    # Galerie d'images
    raw_images = product_jsonld.get("image", [])
    if isinstance(raw_images, str):
        images_list = [raw_images]
    elif isinstance(raw_images, list):
        images_list = [img for img in raw_images if isinstance(img, str)]
    else:
        images_list = []

    main_image = images_list[0] if len(images_list) > 0 else None
    gallery = images_list[1:] if len(images_list) > 1 else []

    # Prix
    raw_price = offer.get("price") or product_jsonld.get("price")
    price_float = None
    if raw_price is not None:
        try:
            price_float = float(raw_price)
        except (ValueError, TypeError):
            price_float = None

    # Stock
    raw_avail = offer.get("availability", "")
    stock_status = "InStock" if "InStock" in raw_avail else (raw_avail or None)

    # URL
    prod_url = offer.get("url") or product_jsonld.get("url") or url
    if prod_url.startswith("//"):
        prod_url = "https:" + prod_url

    # Titre propre
    raw_name = product_jsonld.get("name") or ""
    clean_name = raw_name.replace(" - Buy Product on Alibaba.com", "").replace(" - Acheter Produit sur Alibaba.com", "").strip()

    # Catégorie / Sous-catégorie
    category = categories[0] if len(categories) > 0 else None
    sub_category = categories[-1] if len(categories) > 1 else None

    # Nettoyage des doublons et des chaînes vides
    clean_colors = list(dict.fromkeys([c for c in colors if c]))
    clean_sizes = list(dict.fromkeys([s for s in sizes if s]))

    return ExtractedProduct(
        source="alibaba",
        externalId=str(
            product_jsonld.get("sku") or product_jsonld.get("productID") or ""
        ),
        productName=unescape(clean_name) if clean_name else None,
        productPrice=price_float,
        currency=offer.get("priceCurrency") or product_jsonld.get("priceCurrency"),
        image=main_image,
        gallery=gallery,
        productUrl=prod_url,
        category=category,
        subCategory=sub_category,
        sizes=clean_sizes,
        colors=clean_colors,
        description=unescape(product_jsonld.get("description"))
        if product_jsonld.get("description")
        else None,
        brand=brand_name,
        stock=stock_status,
    )