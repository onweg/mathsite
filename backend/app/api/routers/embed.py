from typing import Annotated

from fastapi import APIRouter, Depends

from app.infrastructure.llm.base import LLMProvider
from app.schemas.embed import EmbedRequest, EmbedResponse

from .. import deps

router = APIRouter()


@router.post("/embed", response_model=EmbedResponse)
async def embed_endpoint(
    req: EmbedRequest,
    llm: Annotated[LLMProvider, Depends(deps.get_llm)],
):
    vec = await llm.embed(req.text, kind=req.kind)
    return EmbedResponse(embedding=vec, dim=len(vec))
