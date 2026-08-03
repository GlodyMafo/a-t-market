from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from services.extractor_router import extract_product
from schemas.request import ExtractRequest

app = FastAPI()


@app.get("/")
def root():
    return {
        "service": "A&T Market Extractor",
        "status": "running"
    }


@app.post("/extract")
async def extract(payload:ExtractRequest ):

    result = await run_in_threadpool(
        extract_product,
        payload.url
    )

    return {
        "success": True,
        "data": result
    }