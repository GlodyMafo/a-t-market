from schemas.product import ExtractedProduct


def extract_shein(url: str):

    return ExtractedProduct(
        source="SHEIN",
        productUrl=url
    )