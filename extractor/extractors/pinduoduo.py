import json
import re
from schemas.product import ExtractedProduct
from services.playwright_service import PlaywrightService


def extract_goods_id_from_text(text: str) -> str | None:
    """Recherche un goods_id numérique dans une chaîne (URL ou HTML)."""
    match = re.search(r"goods_id=(\d+)", text)
    return match.group(1) if match else None


def extract_pinduoduo(url: str) -> ExtractedProduct | None:
    service = PlaywrightService()

    try:
        # 1. Première passe : ouvrir l'URL pour résoudre les redirections et trouver le goods_id
        page = service.open(url)
        
        # Récupérer l'URL finale résolue après redirection
        final_url = page.url
        goods_id = extract_goods_id_from_text(url) or extract_goods_id_from_text(final_url)

        # Si l'URL a été redirigée vers login.html mais qu'on a capturé l'URL de redirection complète dans page.url
        if not goods_id and "from=" in final_url:
            # L'URL de provenance est encodée dans le paramètre 'from' de la page de login
            from_param = re.search(r"from=([^&]+)", final_url)
            if from_param:
                from urllib.parse import unquote
                decoded_url = unquote(from_param.group(1))
                goods_id = extract_goods_id_from_text(decoded_url)

        # 2. Si on a trouvé le goods_id, forcer l'accès sur l'URL standard goods.html
        if goods_id:
            direct_url = f"https://mobile.yangkeduo.com/goods.html?goods_id={goods_id}"
            if page.url != direct_url:
                page.goto(direct_url, wait_until="domcontentloaded", timeout=15000)

        # 3. Récupération des données brutes window.rawData en mémoire
        raw_data = page.evaluate("""() => {
            return window.rawData || window.__INITIAL_STATE__ || null;
        }""")

        # Fallback HTML : Recherche par Regex dans le code source
        if not raw_data:
            content = page.content()
            if not goods_id:
                goods_id = extract_goods_id_from_text(content)

            match = re.search(r"window\.rawData\s*=\s*(\{.*?\});", content)
            if match:
                try:
                    raw_data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    pass

        # Si aucune donnée n'est extraite, le blocage est strict
        if not raw_data:
            print(f"[Pinduoduo] Échec : Redirection login/Anti-bot sur {url} (goods_id trouvé: {goods_id})")
            return None

        # 4. Mappage des champs vers le schéma OpenAPI (ExtractedProduct)
        store_data = raw_data.get("store", {})
        goods_info = store_data.get("goods", {}) or raw_data.get("goods", {})

        title = goods_info.get("goodsName") or goods_info.get("goods_name") or "Produit Pinduoduo"
        
        # Pinduoduo renvoie les prix en centimes (1000 = 10.00 RMB)
        raw_min_price = goods_info.get("minGroupPrice") or goods_info.get("min_group_price") or 0
        price = raw_min_price / 100.0 if raw_min_price else 0.0

        # Galerie d'images
        top_gallery = goods_info.get("topGalleryUrl", []) or goods_info.get("goods_gallery", [])
        gallery = []
        for img in top_gallery:
            if isinstance(img, str):
                gallery.append(img)
            elif isinstance(img, dict) and "url" in img:
                gallery.append(img["url"])

        image_url = gallery[0] if gallery else goods_info.get("hdThumbUrl", "")

        return ExtractedProduct(
            source="PINDUODUO",
            externalId=str(goods_id) if goods_id else "",
            productName=title,
            productPrice=price,
            currency="CNY",
            image=image_url,
            gallery=gallery,
            productUrl=f"https://mobile.yangkeduo.com/goods.html?goods_id={goods_id}" if goods_id else url,
            category=goods_info.get("catName", ""),
            subCategory="",
            sizes=[],
            colors=[],
            description=goods_info.get("goodsDesc", ""),
            brand="",
            stock="IN_STOCK"
        )

    except Exception as e:
        print(f"[Pinduoduo] Erreur extraction : {e}")
        return None

    finally:
        service.close()