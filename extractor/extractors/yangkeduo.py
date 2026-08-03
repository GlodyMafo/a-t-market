from schemas.product import ExtractedProduct


def extract_pinduoduo(url: str):

    return ExtractedProduct(
        source="PINDUODUO",
        productUrl=url
    )