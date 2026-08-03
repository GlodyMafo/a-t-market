from urllib.parse import urlparse


def detect_platform(url: str) -> str:

    host = urlparse(url).netloc.lower()

    if "amazon" in host:
        return "AMAZON"

    if "shein" in host:
        return "SHEIN"

    if "alibaba" in host:
        return "ALIBABA"

    if "1688.com" in host:
        return "1688"

    if "taobao" in host:
        return "TAOBAO"

    if (
        "yangkeduo" in host
        or "pinduoduo" in host
    ):
        return "PINDUODUO"

    return "UNKNOWN"