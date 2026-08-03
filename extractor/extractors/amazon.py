from playwright.sync_api import sync_playwright

from schemas.product import ExtractedProduct


def extract_amazon(url: str):

    with sync_playwright() as p:

        browser = p.chromium.launch(
            headless=True
        )

        page = browser.new_page()

        try:

            page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=60000
            )

            page.wait_for_timeout(4000)

            title = None
            price = None
            currency = None
            image = None

            category = None
            sub_category = None

            description = None
            brand = None
            stock = None

            sizes = []
            colors = []

            # --------------------
            # TITRE
            # --------------------

            title_locator = page.locator(
                "#productTitle"
            )

            if title_locator.count() > 0:

                title = (
                    title_locator
                    .first
                    .inner_text()
                    .strip()
                )

            # --------------------
            # PRIX
            # --------------------

            price_locator = page.locator(
                ".a-price .a-offscreen"
            )

            if price_locator.count() > 0:

                raw_price = (
                    price_locator
                    .first
                    .inner_text()
                    .strip()
                )

                raw_price = raw_price.replace(
                    "\u00a0",
                    ""
                )

                if "€" in raw_price:
                    currency = "EUR"

                elif "$" in raw_price:
                    currency = "USD"

                cleaned = (
                    raw_price
                    .replace("€", "")
                    .replace("$", "")
                    .replace(",", ".")
                    .strip()
                )

                try:
                    price = float(cleaned)
                except:
                    pass

            # --------------------
            # IMAGE
            # --------------------

            image_locator = page.locator(
                "#landingImage"
            )

            if image_locator.count() > 0:

                image = image_locator.first.get_attribute(
                    "src"
                )

            # --------------------
            # DESCRIPTION
            # --------------------

            description_locator = page.locator(
                "#productDescription"
            )

            if description_locator.count() > 0:

                description = (
                    description_locator
                    .first
                    .inner_text()
                    .strip()
                )

            # --------------------
            # MARQUE
            # --------------------

            brand_locator = page.locator(
                "#bylineInfo"
            )

            if brand_locator.count() > 0:

                brand = (
                    brand_locator
                    .first
                    .inner_text()
                    .strip()
                )

            # --------------------
            # STOCK
            # --------------------

            stock_locator = page.locator(
                "#availability"
            )

            if stock_locator.count() > 0:

                stock = (
                    stock_locator
                    .first
                    .inner_text()
                    .strip()
                )

            # --------------------
            # CATÉGORIE
            # --------------------

            breadcrumb_items = page.locator(
                "#wayfinding-breadcrumbs_feature_div ul li"
            )

            breadcrumb_count = breadcrumb_items.count()

            if breadcrumb_count >= 1:

                try:
                    category = (
                        breadcrumb_items
                        .nth(0)
                        .inner_text()
                        .strip()
                    )
                except:
                    pass

            if breadcrumb_count >= 2:

                try:
                    sub_category = (
                        breadcrumb_items
                        .nth(1)
                        .inner_text()
                        .strip()
                    )
                except:
                    pass

            # --------------------
            # COULEURS
            # --------------------

            color_buttons = page.locator(
                "#variation_color_name li"
            )

            for i in range(color_buttons.count()):

                try:

                    color = (
                        color_buttons
                        .nth(i)
                        .get_attribute(
                            "title"
                        )
                    )

                    if color:

                        color = color.strip()

                        if color not in colors:

                            colors.append(color)

                except:
                    pass

            # --------------------
            # TAILLES
            # --------------------

            size_buttons = page.locator(
                "#variation_size_name li"
            )

            for i in range(size_buttons.count()):

                try:

                    size = (
                        size_buttons
                        .nth(i)
                        .inner_text()
                        .strip()
                    )

                    if size and size not in sizes:

                        sizes.append(size)

                except:
                    pass

            return ExtractedProduct(

                source="AMAZON",

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

            browser.close()