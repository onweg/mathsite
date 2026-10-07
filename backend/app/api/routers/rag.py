from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.errors import RateLimited
from app.infrastructure.ratelimit.base import RateLimiter
from app.schemas.rag import RagChunkOut, RagRequest, RagResponse
from app.services.rag_service import RagService

from .. import deps

router = APIRouter()


def _preview(text: str, n: int = 220) -> str:
    return text[:n] + ("…" if len(text) > n else "")


@router.post("/rag/ask", response_model=RagResponse)
async def rag_ask(
    req: RagRequest,
    rag_service: Annotated[RagService, Depends(deps.get_rag_service)],
    rate_limiter: Annotated[RateLimiter, Depends(deps.get_rate_limiter)],
    ip: Annotated[str, Depends(deps.client_ip)],
):
    ok, reason = rate_limiter.check(ip)
    if not ok:
        raise RateLimited(reason)

    ans = await rag_service.ask(req.query, topic=req.topic, limit=req.limit)
    return RagResponse(
        text=ans.reply.text,
        reason="no_relevant_chunks" if ans.not_found else None,
        chunks=[
            RagChunkOut(
                page=h.page,
                source=h.source,
                similarity=h.similarity,
                preview=_preview(h.text),
            )
            for h in ans.hits
        ],
    )
