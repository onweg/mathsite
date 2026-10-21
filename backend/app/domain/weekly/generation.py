"""Генерация задачи недели LLM: промпт + Pydantic-валидация ответа.

В отличие от квиза здесь одна задача, зато с полным решением: учитель получает
черновик, правит формулировку и публикует. Решение ученикам не отдаётся
(`WeeklyTaskPublicDTO` его не содержит).

Про источник действует то же правило, что и в квизах: текст учебника извлечён
из PDF и формулы в нём разрушены, поэтому источник задаёт тему и типаж, а
формулы модель пишет сама. Проверка — `looks_garbled` из домена квизов,
детектор там один на оба генератора.
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.errors import LLMBadResponse
from app.domain.llm_json import extract_json
from app.domain.quiz.generation import looks_garbled

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

_SOURCE_RULE = """- Материал из раздела «Источник» задаёт тему, типаж и уровень задачи. Бери оттуда смысл, а не текст.
- ВАЖНО: источник извлечён из PDF, и формулы в нём разрушены. Дробь приходит строкой
  («a b 3 24» — это $\\\\frac{ab^3}{24}$), знак умножения — обрывком вроде «/mat7».
  Восстанавливай смысл и записывай формулы заново, дословно из источника не переписывай."""

_NO_SOURCE_RULE = """- Опирайся на школьную программу алгебры и геометрии 8 класса.
- Не выдумывай тем вне программы и экзотических обозначений."""

_PROMPT_HEADER = """Составь ОДНУ задачу недели по математике для 8 класса российской школы.

Правила:
{source_rule}
- Задача должна быть самодостаточной: условие понятно без доступа к учебнику.
- Формулы — LaTeX: inline $x^2+1$, выключные $$...$$ только в решении.
- Внутри JSON обратные слэши удваивай: \\\\frac, \\\\sqrt, \\\\le.
- Условие: 1-4 предложения, без подсказок к решению и без ответа.
- Решение: полный разбор по шагам, в конце отдельной строкой «**Ответ:** ...».
- Никаких ссылок на страницы и номера упражнений учебника.
- Отвечай строго валидным JSON по схеме. Без текста до и после.

Схема ответа:
{{
  "title": "короткое название, 3-7 слов",
  "body_md": "условие задачи (markdown + LaTeX)",
  "answer_md": "полное решение с ответом (markdown + LaTeX)"
}}
"""


def _header(*, with_source: bool) -> str:
    return _PROMPT_HEADER.format(
        source_rule=_SOURCE_RULE if with_source else _NO_SOURCE_RULE
    )


def _hint_block(hint: str | None) -> str:
    clean = (hint or "").strip()
    return f"\nПожелания учителя (выполни их, если они не противоречат правилам выше):\n{clean}\n" if clean else ""


def _source_block(source_fragments: list[str]) -> str:
    if not source_fragments:
        return ""
    return "\nИсточник:\n" + "\n\n---\n\n".join(source_fragments) + "\n"


def build_weekly_prompt(
    *,
    topic: str,
    level: Level,
    source_fragments: list[str],
    hint: str | None = None,
) -> str:
    return (
        _header(with_source=bool(source_fragments))
        + f"\nТема: {topic}\n"
        + f"Уровень: {level}. {_LEVEL_HINT[level]}\n"
        + _hint_block(hint)
        + _source_block(source_fragments)
    )


def build_weekly_refine_prompt(
    *,
    title: str,
    body_md: str,
    answer_md: str,
    level: Level,
    instruction: str,
    source_fragments: list[str],
) -> str:
    """Промпт доработки: текущая задача целиком + замечание учителя.

    Модель переписывает то, о чём попросили, и сохраняет остальное. Решение
    пересобирается всегда — после правки условия старый разбор к нему уже не
    подходит, а несогласованная пара «условие/решение» хуже, чем лишний абзац.
    """
    return (
        _header(with_source=bool(source_fragments))
        + "\nЭто ДОРАБОТКА уже готовой задачи, а не новая задача.\n"
        + "- Сохрани то, чего замечание не касается: сюжет, числа, формулировки.\n"
        + "- Решение приведи в соответствие с исправленным условием.\n"
        + f"\nУровень: {level}. {_LEVEL_HINT[level]}\n"
        + f"\nТекущая задача:\nНазвание: {title}\n\nУсловие:\n{body_md}\n\nРешение:\n{answer_md}\n"
        + f"\nЗамечание учителя:\n{instruction.strip()}\n"
        + _source_block(source_fragments)
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

    if looks_garbled(parsed.body_md):
        raise LLMBadResponse(
            f"условие переписано из повреждённого текста учебника: {parsed.body_md[:80]!r}"
        )

    return GWeeklyTask(
        title=parsed.title.strip(),
        body_md=parsed.body_md.strip(),
        answer_md=parsed.answer_md.strip(),
    )


__all__ = [
    "GWeeklyTask",
    "Level",
    "SYSTEM_PROMPT",
    "build_weekly_prompt",
    "build_weekly_refine_prompt",
    "parse_weekly_generation",
]
