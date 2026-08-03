# from schemas.product import ExtractedProduct

# from services.playwright_service import extract_product_data_sync


# def extract_generic(url: str):

#     data = extract_product_data_sync(url)

#     return ExtractedProduct(

#         source="GENERIC",

#         productName=data.get("title"),

#         productPrice=data.get("price"),

#         currency=data.get("currency"),

#         image=data.get("image"),

#         productUrl=url,

#         description=data.get("description"),

#         availableSizes=data.get("availableSizes", []),

#         availableColors=data.get("availableColors", []),

#         gallery=data.get("gallery", [])
#     )