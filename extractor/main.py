from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class ExtractRequest(BaseModel):
    url: str


@app.get("/")
def root():

    return {
        "service": "A&T Extractor",
        "status": "running"
    }


@app.post("/extract")
def extract_product(data: ExtractRequest):

    return {
        "success": True,
        "name": "Produit Test",
        "image": "https://image.test/product.jpg",
        "price": 25,
        "currency": "USD",
        "source": "mock",
        "url": data.url
    }