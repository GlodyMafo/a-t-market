from pydantic import BaseModel, Field


class ExtractedProduct(BaseModel):
    """
    Modèle unique utilisé par tous les extracteurs.
    Chaque plateforme doit retourner exactement cette structure.
    """

    # Informations générales
    source: str
    externalId: str | None = None

    # Produit
    productName: str | None = None
    productPrice: float | None = None
    currency: str | None = None

    # Images
    image: str | None = None
    gallery: list[str] = Field(default_factory=list)

    # URL
    productUrl: str

    # Classification
    category: str | None = None
    subCategory: str | None = None

    # Variantes
    sizes: list[str] = Field(default_factory=list)
    colors: list[str] = Field(default_factory=list)

    # Informations complémentaires
    description: str | None = None
    brand: str | None = None
    stock: str | None = None