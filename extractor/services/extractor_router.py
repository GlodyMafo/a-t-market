from extractors.alibaba import extract_alibaba
from extractors.amazon import extract_amazon
from extractors.pinduoduo import extract_pinduoduo
from extractors.shein import extract_shein
from extractors.taobao import extract_taobao
from extractors.x1688 import extract_1688
from schemas.product import ExtractedProduct
from services.detector import detect_platform


def extract_product(url: str) -> ExtractedProduct | None:
    platform = detect_platform(url)

    match platform:
        case "AMAZON":
            return extract_amazon(url)

        case "ALIBABA":
            return extract_alibaba(url)

        case "SHEIN":
            return extract_shein(url)

        case "TAOBAO":
            return extract_taobao(url)

        case "1688":
            return extract_1688(url)

        case "PINDUODUO":
            return extract_pinduoduo(url)

        case _:
            raise Exception(f"Plateforme non supportée : {platform}")