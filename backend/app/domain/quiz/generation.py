"""Генерация квиза LLM: промпт + Pydantic-валидация ответа.

Схема ответа модели — строгий JSON, который валидируется и мапится в домен.
Если модель отдала невалидный JSON — поднимаем LLMBadResponse, зовущий повторит запрос.
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.errors import LLMBadResponse
from app.domain.llm_json import extract_json
from app.domain.quiz.types import Choice, Difficulty, ItemKind, QuizItem


class GChoice(BaseModel):
    id: str = Field(min_length=1, max_length=4)
    text: str = Field(min_length=1, max_length=400)


class GQuizItem(BaseModel):
    kind: Literal["mcq"] = "mcq"
    question_md: str = Field(min_length=5, max_length=800)
    choices: list[GChoice] = Field(min_length=2, max_length=5)
    correct_answer: str = Field(min_length=1, max_length=4)
    explanation: str | None = Field(default=None, max_length=800)


class GQuiz(BaseModel):
    items: list[GQuizItem] = Field(min_length=1, max_length=20)


_PROMPT_HEADER = """Ты составляешь тест по математике для 8 класса российской школы.

Правила:
- Используй ТОЛЬКО материал ниже в разделе «Источник». Ничего не выдумывай.
- Отвечай строго валидным JSON по приведённой схеме. Без комментариев, без текста до/после.
- Формат математики — LaTeX inline: $x^2 + 1$. Блочных формул не используй.
- Все вопросы — multiple choice (kind="mcq"), 4 варианта (id: "a","b","c","d").
- Один правильный вариант, в поле correct_answer указывай его id.
- Варианты должны быть правдоподобно похожи, различия — тонкие (знак, степень, порядок, типичная ошибка).
- Короткие формулировки. Текст условия — не длиннее 2 предложений.
- Разнообразь: расчётные, концептуальные, на преобразование.

Схема ответа:
{
  "items": [
    {
      "kind": "mcq",
      "question_md": "строка",
      "choices": [
        {"id": "a", "text": "..."},
        {"id": "b", "text": "..."},
        {"id": "c", "text": "..."},
        {"id": "d", "text": "..."}
      ],
      "correct_answer": "a",
      "explanation": "краткое объяснение почему именно этот ответ"
    }
  ]
}
"""


_DIFFICULTY_HINT: dict[Difficulty, str] = {
    "easy": "Простые задачи на прямое применение определений.",
    "medium": "Среднего уровня: 1-2 шага преобразования, проверка понимания.",
    "hard": "Повышенной сложности: несколько шагов, типичные ловушки.",
}


def build_generation_prompt(
    *,
    topic: str,
    difficulty: Difficulty,
    items_count: int,
    source_fragments: list[str],
) -> str:
    """Собрать user-промпт для LLM. source_fragments — тексты RAG-чанков."""
    fragments = "\n\n---\n\n".join(source_fragments)
    return (
        _PROMPT_HEADER
        + f"\nТема: {topic}\n"
        + f"Сложность: {difficulty}. {_DIFFICULTY_HINT[difficulty]}\n"
        + f"Количество вопросов: {items_count}.\n\n"
        + f"Источник:\n{fragments}\n"
    )


def parse_generation(raw: str) -> list[QuizItem]:
    """Распарсить ответ LLM и смапить в доменные QuizItem (id=None, position задаст сервис)."""
    try:
        payload = json.loads(extract_json(raw))
    except json.JSONDecodeError as e:
        raise LLMBadResponse(f"невалидный JSON: {e}") from e

    try:
        parsed = GQuiz.model_validate(payload)
    except ValidationError as e:
        raise LLMBadResponse(f"ответ не соответствует схеме: {e.error_count()} ошибок") from e

    items: list[QuizItem] = []
    for i, g in enumerate(parsed.items):
        ids = {c.id for c in g.choices}
        if g.correct_answer not in ids:
            raise LLMBadResponse(
                f"item {i}: correct_answer={g.correct_answer!r} не входит в варианты {sorted(ids)}"
            )
        items.append(
            QuizItem(
                id=None,
                position=i + 1,
                kind="mcq",
                question_md=g.question_md.strip(),
                choices=[Choice(id=c.id, text=c.text.strip()) for c in g.choices],
                correct_answer=g.correct_answer,
                explanation=(g.explanation or "").strip() or None,
            )
        )
    return items


__all__ = ["build_generation_prompt", "parse_generation", "ItemKind"]
