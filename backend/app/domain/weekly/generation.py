"""Генерация задачи недели LLM: промпт + Pydantic-валидация ответа.

В отличие от квиза здесь одна задача, зато с полным решением: учитель получает
черновик, правит формулировку и публикует. Решение ученикам не отдаётся
(`WeeklyTaskPublicDTO` его не содержит).
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.errors import LLMBadResponse
from app.domain.llm_json import extract_json

Level = Literal["school", "olympiad", "hard"]


class GWeeklyTask(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    body_md: str = Field(min_length=10, max_length=3000)
    answer_md: str = Field(min_length=10, max_length=3000)


SYSTEM_PROMPT = (
    "Ты — учитель математики 8 класса, составляешь задачу недели. "
    "Отвечай строго валидным JSON по приведённой схеме. Никаких комментариев."
)

_LEVEL_HINT: dict[Level, str] = {
    "school": "Уровень обычной школьной задачи: 2-3 шага, без хитростей.",
    "olympiad": "Олимпиадный уровень школьного этапа: нужна идея, но решение короткое.",
    "hard": "Повышенная сложность: несколько идей, нестандартный ход. Но всё ещё в рамках 8 класса.",
}

_PROMPT_HEADER = """Составь ОДНУ задачу недели по математике для 8 класса российской школы.

Правила:
- Опирайся на материал из раздела «Источник» ниже: бери оттуда тему, типаж и уровень задачи.
- Задача должна быть самодостаточной: условие понятно без доступа к учебнику.
- Формулы — LaTeX: inline $x^2+1$, выключные $$...$$ только в решении.
- Условие: 1-4 предложения, без подсказок к решению и без ответа.
- Решение: полный разбор по шагам, в конце отдельной строкой «**Ответ:** ...».
- Никаких ссылок на страницы и номера упражнений учебника.
- Отвечай строго валидным JSON по схеме. Без текста до и после.

Схема ответа:
{
  "title": "короткое название, 3-7 слов",
  "body_md": "условие задачи (markdown + LaTeX)",
  "answer_md": "полное решение с ответом (markdown + LaTeX)"
}
"""


def build_weekly_prompt(
    *,
    topic: str,
    level: Level,
    source_fragments: list[str],
) -> str:
    fragments = "\n\n---\n\n".join(source_fragments)
    return (
        _PROMPT_HEADER
        + f"\nТема: {topic}\n"
        + f"Уровень: {level}. {_LEVEL_HINT[level]}\n\n"
        + f"Источник:\n{fragments}\n"
    )


def parse_weekly_generation(raw: str) -> GWeeklyTask:
    try:
        payload = json.loads(extract_json(raw))
    except json.JSONDecodeError as e:
        raise LLMBadResponse(f"невалидный JSON: {e}") from e

    try:
        parsed = GWeeklyTask.model_validate(payload)
    except ValidationError as e:
        raise LLMBadResponse(f"ответ не соответствует схеме: {e.error_count()} ошибок") from e

    return GWeeklyTask(
        title=parsed.title.strip(),
        body_md=parsed.body_md.strip(),
        answer_md=parsed.answer_md.strip(),
    )


__all__ = ["GWeeklyTask", "Level", "SYSTEM_PROMPT", "build_weekly_prompt", "parse_weekly_generation"]
