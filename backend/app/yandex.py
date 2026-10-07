from typing import Literal

import httpx

from .config import settings

CHAT_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
EMBED_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding"

Role = Literal["system", "user", "assistant"]


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Api-Key {settings.yc_api_key}",
        "x-folder-id": settings.yc_folder_id,
        "Content-Type": "application/json",
    }


def _chat_uri() -> str:
    return f"gpt://{settings.yc_folder_id}/{settings.yc_model_chat}"


def _embed_uri(kind: Literal["doc", "query"]) -> str:
    model = settings.yc_model_embed_doc if kind == "doc" else settings.yc_model_embed_query
    return f"emb://{settings.yc_folder_id}/{model}"


async def chat(
    messages: list[dict],
    temperature: float = 0.6,
    max_tokens: int = 2000,
) -> dict:
    """Call YandexGPT chat completion. Returns {text, usage, model_version}."""
    payload = {
        "modelUri": _chat_uri(),
        "completionOptions": {
            "stream": False,
            "temperature": temperature,
            "maxTokens": str(max_tokens),
        },
        "messages": [{"role": m["role"], "text": m["text"]} for m in messages],
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(CHAT_URL, json=payload, headers=_headers())
        r.raise_for_status()
        data = r.json()

    result = data.get("result") or data
    alt = result["alternatives"][0]
    return {
        "text": alt["message"]["text"],
        "status": alt.get("status"),
        "usage": result.get("usage", {}),
        "model_version": result.get("modelVersion"),
    }


async def embed(text: str, kind: Literal["doc", "query"] = "query") -> list[float]:
    payload = {"modelUri": _embed_uri(kind), "text": text}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(EMBED_URL, json=payload, headers=_headers())
        r.raise_for_status()
        data = r.json()
    return data["embedding"]
