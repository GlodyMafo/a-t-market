from services.playwright_service import PlaywrightService
from schemas.product import ExtractedProduct


def extract_pinduoduo(url: str) -> ExtractedProduct | None:

    service = PlaywrightService()

    try:
        page = service.open(url)

        print("=" * 80)
        print("PINDUODUO - DIAGNOSTIC")
        print("=" * 80)

        print("URL demandée :", url)
        print("URL finale   :", page.url)
        print("Titre        :", page.title())

        html = page.content()

        print("HTML length  :", len(html))

        print("\n--- HTML début ---")
        print(html[:5000])

        return ExtractedProduct(
            source="PINDUODUO",
            productUrl=url,
        )

    finally:
        service.close()