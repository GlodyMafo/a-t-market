from schemas.product import ExtractedProduct


def extract_taobao(url: str):

    return ExtractedProduct(
        source="TAOBAO",
        productUrl=url
    )