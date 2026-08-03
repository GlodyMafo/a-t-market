from schemas.product import ExtractedProduct
from services.playwright_service import PlaywrightService


def extract_alibaba(url: str):

    service = PlaywrightService()

    try:

        page = service.open(
            url,
            timeout=90000
        )

        title = None
        price = None
        currency = None
        image = None

        category = None
        sub_category = None

        description = None
        brand = None

        stock = "Disponible"

        sizes = []
        colors = []

        # -------------------------
        # TITRE
        # -------------------------

        title_selectors = [
            "h1",
            "[data-pl='product-title']",
            ".product-title"
        ]

        for selector in title_selectors:

            locator = page.locator(selector)

            if locator.count() > 0:

                text = locator.first.inner_text().strip()

                if text:

                    title = text
                    break

        # -------------------------
        # PRIX
        # -------------------------

        price_selectors = [
            ".price",
            ".product-price-value",
            "[data-role='price']"
        ]

        for selector in price_selectors:

            locator = page.locator(selector)

            if locator.count() > 0:

                raw_price = (
                    locator.first
                    .inner_text()
                    .strip()
                )

                if "$" in raw_price:
                    currency = "USD"

                cleaned = (
                    raw_price
                    .replace("$", "")
                    .replace(",", "")
                    .strip()
                )

                try:

                    price = float(
                        cleaned.split()[0]
                    )

                    break

                except Exception:
                    pass

        # -------------------------
        # IMAGE
        # -------------------------

        image_selectors = [
            "img",
            ".main-img img"
        ]

        for selector in image_selectors:

            locator = page.locator(selector)

            if locator.count() > 0:

                src = locator.first.get_attribute(
                    "src"
                )

                if src:

                    image = src

                    if src.startswith("//"):
                        image = "https:" + src

                    break

        # -------------------------
        # CATEGORIES
        # -------------------------

        breadcrumb = page.locator(
            "a"
        ).all_inner_texts()

        cleaned = [
            x.strip()
            for x in breadcrumb
            if len(x.strip()) > 2
        ]

        if len(cleaned) >= 2:

            category = cleaned[0]

            sub_category = cleaned[1]

        # -------------------------
        # DESCRIPTION
        # -------------------------

        description_selectors = [
            "#product-description",
            ".detail-desc-decorate-richtext"
        ]

        for selector in description_selectors:

            locator = page.locator(selector)

            if locator.count() > 0:

                description = (
                    locator.first
                    .inner_text()
                    .strip()
                )

                break

        # -------------------------
        # MARQUE
        # -------------------------

        brand_selectors = [
            ".supplier-name",
            ".company-name"
        ]

        for selector in brand_selectors:

            locator = page.locator(selector)

            if locator.count() > 0:

                brand = (
                    locator.first
                    .inner_text()
                    .strip()
                )

                break

        return ExtractedProduct(

            source="ALIBABA",

            productName=title,

            productPrice=price,

            currency=currency,

            image=image,

            productUrl=url,

            category=category,

            subCategory=sub_category,

            sizes=sizes,

            colors=colors,

            description=description,

            brand=brand,

            stock=stock
        )

    finally:

        service.close()