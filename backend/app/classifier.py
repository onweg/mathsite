"""Слой 2 — быстрый LLM-классификатор темы.

Отдельный мини-запрос в YandexGPT: является ли вопрос ученика
вопросом по школьной математике. Один токен ответа, стоимость копеечная.
"""

import logging

import httpx

from . import yandex
from .prompts import CLASSIFIER_PROMPT

log = logging.getLogger("mathsite.classifier")


async def is_math_question(user_text: str) -> bool:
    """True — похоже на вопрос по математике. False — что-то другое.

    При любой ошибке/таймауте возвращаем True, чтобы не ломать
    пользовательский опыт из-за сетевой проблемы: дальше всё равно
    отработают system prompt и post-filter.
    """
    messages = [
        {"role": "system", "text": CLASSIFIER_PROMPT},
        {"role": "user", "text": user_text[:500]},
    ]
    try:
        result = await yandex.chat(messages, temperature=0.0, max_tokens=5)
    except (httpx.HTTPError, KeyError, IndexError) as e:
        log.warning("classifier failed, passing through: %s", e)
        return True

    answer = (result.get("text") or "").strip().lower()
    # «YES», «yes», «да» → пропускаем; иначе блок
    if answer.startswith(("y", "д")):
        return True
    log.info("classifier blocked: '%s' → '%s'", user_text[:80], answer[:40])
    return False
