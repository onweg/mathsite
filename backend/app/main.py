import logging

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from . import classifier, rag, safety, yandex
from .config import settings
from .prompts import REFUSAL, system_prompt
from .ratelimit import limiter
from .schemas import (
    ChatRequest,
    ChatResponse,
    EmbedRequest,
    EmbedResponse,
    RagChunk,
    RagRequest,
    RagResponse,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s · %(message)s",
)
log = logging.getLogger("mathsite")

app = FastAPI(title="Mathematica API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "env": settings.app_env,
        "folder": settings.yc_folder_id[:6] + "…",
    }


def _refusal(reason: str) -> ChatResponse:
    log.info("REFUSAL (%s)", reason)
    return ChatResponse(text=REFUSAL, blocked=True, reason=reason)


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"

    # Rate limiting
    ok, lim_reason = limiter.check(client_ip)
    if not ok:
        log.warning("rate limited %s: %s", client_ip, lim_reason)
        raise HTTPException(status_code=429, detail=f"Слишком часто. {lim_reason}")

    # Берём последнее сообщение ученика
    last_user = next(
        (m for m in reversed(req.messages) if m.role == "user"), None
    )
    if last_user is None:
        raise HTTPException(status_code=400, detail="нет сообщения от ученика")

    # Слой 1 — pre-filter
    pre = safety.check_user_message(last_user.text)
    if not pre.passed:
        return _refusal(f"pre_filter:{pre.verdict}:{pre.reason}")

    # Если PII заменили — используем очищенный текст
    cleaned_user_text = pre.cleaned or last_user.text

    # Слой 2 — LLM-классификатор темы
    if not await classifier.is_math_question(cleaned_user_text):
        return _refusal("classifier:not_math")

    # Собираем сообщения: system (жёсткие правила + тема) + история + последнее сообщение
    sys_text = system_prompt(req.topic)
    if req.section:
        sys_text += f"\n\nКонтекст страницы: {req.section}"

    messages: list[dict] = [{"role": "system", "text": sys_text}]
    # добавляем историю (кроме последнего user — его подставим очищенным)
    history_without_last = list(req.messages)
    if history_without_last and history_without_last[-1].role == "user":
        history_without_last = history_without_last[:-1]
    for m in history_without_last:
        if m.role in ("user", "assistant"):
            messages.append({"role": m.role, "text": m.text})
    messages.append({"role": "user", "text": cleaned_user_text})

    # Слой 3 — основной запрос с жёстким system prompt
    try:
        result = await yandex.chat(messages, temperature=req.temperature)
    except httpx.HTTPStatusError as e:
        log.error("YandexGPT %s: %s", e.response.status_code, e.response.text[:500])
        raise HTTPException(
            status_code=502,
            detail=f"YandexGPT вернул ошибку {e.response.status_code}",
        ) from e
    except httpx.HTTPError as e:
        log.exception("YandexGPT transport error")
        raise HTTPException(status_code=502, detail=f"YandexGPT недоступен: {e}") from e

    reply_text = result["text"]

    # Слой 4 — post-filter
    post = safety.check_assistant_reply(reply_text)
    if not post.passed:
        return _refusal(f"post_filter:{post.verdict}:{post.reason}")

    log.info("OK %s · topic=%s · in=%d · out=%d",
             client_ip, req.topic or "-", len(cleaned_user_text), len(reply_text))

    return ChatResponse(
        text=reply_text,
        blocked=False,
        model_version=result.get("model_version"),
        usage=result.get("usage") or {},
    )


@app.post("/rag/ask", response_model=RagResponse)
async def rag_ask(req: RagRequest, request: Request):
    """RAG-only ответ по учебнику. Слой 5 защиты.

    Отличие от /chat: если релевантных чанков не нашлось — не идём в LLM вообще.
    Если нашлось — модель видит ТОЛЬКО фрагменты учебника + вопрос.
    """
    client_ip = request.client.host if request.client else "unknown"
    ok, lim_reason = limiter.check(client_ip)
    if not ok:
        raise HTTPException(status_code=429, detail=f"Слишком часто. {lim_reason}")

    pre = safety.check_user_message(req.query)
    if not pre.passed:
        return RagResponse(text=REFUSAL, blocked=True, reason=f"pre_filter:{pre.reason}")
    query = pre.cleaned or req.query

    if not await classifier.is_math_question(query):
        return RagResponse(text=REFUSAL, blocked=True, reason="classifier:not_math")

    source: rag.Source | None
    if req.topic == "algebra":
        source = "textbook_8_algebra"
    elif req.topic == "geometry":
        source = "textbook_8_geometry"
    else:
        source = None

    chunks = await rag.search(query, source=source, limit=req.limit)
    if not chunks:
        return RagResponse(
            text="В учебнике 8 класса я не нашёл ответа на этот вопрос. Спроси у учителя.",
            blocked=False,
            reason="no_relevant_chunks",
        )

    prompt = rag.build_rag_prompt(query, chunks)
    sys_text = system_prompt(req.topic)
    messages = [
        {"role": "system", "text": sys_text},
        {"role": "user", "text": prompt},
    ]
    try:
        result = await yandex.chat(messages, temperature=0.2)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"YandexGPT недоступен: {e}") from e

    reply = result["text"]
    post = safety.check_assistant_reply(reply)
    if not post.passed:
        return RagResponse(text=REFUSAL, blocked=True, reason=f"post_filter:{post.reason}")

    log.info("RAG ok · topic=%s · chunks=%d · best=%.3f",
             req.topic or "-", len(chunks), chunks[0]["similarity"])

    return RagResponse(
        text=reply,
        blocked=False,
        chunks=[
            RagChunk(
                page=c["page"],
                source=c["source"],
                similarity=c["similarity"],
                preview=c["text"][:220] + ("…" if len(c["text"]) > 220 else ""),
            )
            for c in chunks
        ],
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed_endpoint(req: EmbedRequest):
    try:
        vec = await yandex.embed(req.text, kind=req.kind)
    except httpx.HTTPStatusError as e:
        log.error("YC embed %s: %s", e.response.status_code, e.response.text[:500])
        raise HTTPException(
            status_code=502,
            detail=f"Yandex embed вернул ошибку {e.response.status_code}",
        ) from e
    return EmbedResponse(embedding=vec, dim=len(vec))
