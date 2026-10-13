"""Вытаскивание JSON из ответа LLM.

Модели регулярно оборачивают JSON в ```json ... ``` или добавляют текст до/после.
Логика одна на всех генераторов (квизы, задача недели), поэтому живёт здесь.
"""

from __future__ import annotations

import re

from app.core.errors import LLMBadResponse

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_json(text: str) -> str:
    m = _JSON_FENCE_RE.search(text)
    if m:
        return m.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise LLMBadResponse("модель не вернула JSON")
    return text[start : end + 1]


__all__ = ["extract_json"]
