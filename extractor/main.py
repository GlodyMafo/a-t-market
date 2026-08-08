from fastapi import FastAPI, HTTPException, status
from starlette.concurrency import run_in_threadpool

from schemas.product import ExtractedProduct
from schemas.request import ExtractRequest
from services.extractor_router import extract_product

app = FastAPI(
    title="A&T Market Extractor API",
    version="1.0.0",
)


@app.get("/")
def root():
    return {"service": "A&T Market Extractor", "status": "running"}


@app.post(
    "/extract",
    response_model=ExtractedProduct,
    status_code=status.HTTP_200_OK,
    summary="Extraire les détails d'un produit",
)
async def extract(payload: ExtractRequest):
    try:
        result = await run_in_threadpool(extract_product, payload.url)

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Impossible d'extraire les informations du produit pour cette URL.",
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de l'extraction : {str(e)}",
        )