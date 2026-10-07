"""Слой 2 — LLM-классификатор темы (математика / не математика).

Fail-open: при любой сетевой ошибке пропускаем — дальше отработает слой 3 (system prompt)
и слой 4 (post-filter).
"""

import logging

from app.core.errors import LLMUnavailable
from app.domain.chat.types import Message
from app.domain.rag.prompts import CLASSIFIER_PROMPT
from app.infrastructure.llm.base import LLMProvider

log = logging.getLogger("mathsite.classifier")


class ClassifierService:
    def __init__(self, llm: LLMProvider):
        self._llm = llm

    async def is_math_question(self, text: str) -> bool:
        try:
            reply = await self._llm.chat(
                [
                    Message(role="system", text=CLASSIFIER_PROMPT),
                    Message(role="user", text=text[:500]),
                ],
                temperature=0.0,
                max_tokens=5,
            )
        except LLMUnavailable as e:
            log.warning("classifier fail-open: %s", e)
            return True

        answer = (reply.text or "").strip().lower()
        if answer.startswith(("y", "д")):
            return True
        log.info("classifier blocked: '%s' → '%s'", text[:80], answer[:40])
        return False
