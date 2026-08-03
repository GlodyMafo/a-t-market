from pydantic import BaseModel


class ExtractRequest(BaseModel):
    url: str