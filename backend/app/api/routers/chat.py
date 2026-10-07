from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.errors import RateLimited
from app.domain.chat.types import Message
from app.infrastructure.ratelimit.base import RateLimiter
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat_service import ChatService

from .. import deps

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    req: ChatRequest,
    chat_service: Annotated[ChatService, Depends(deps.get_chat_service)],
    rate_limiter: Annotated[RateLimiter, Depends(deps.get_rate_limiter)],
    ip: Annotated[str, Depends(deps.client_ip)],
):
    ok, reason = rate_limiter.check(ip)
    if not ok:
        raise RateLimited(reason)

    messages = [Message(role=m.role, text=m.text) for m in req.messages]
    reply = await chat_service.ask(
        messages,
        topic=req.topic,
        section=req.section,
        temperature=req.temperature,
    )
    return ChatResponse(
        text=reply.text,
        model_version=reply.model_version,
        usage=reply.usage or {},
    )
