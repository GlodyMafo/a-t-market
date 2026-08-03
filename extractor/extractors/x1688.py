from schemas.product import ExtractedProduct


def extract_1688(url: str):

    return ExtractedProduct(
        source="1688",
        productUrl=url
    )