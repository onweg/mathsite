"""Генерация квиза LLM: промпт + Pydantic-валидация ответа.

Схема ответа модели — строгий JSON, который валидируется и мапится в домен.
Если модель отдала невалидный JSON — поднимаем LLMBadResponse, зовущий повторит запрос.
"""

from __future__ import annotations

import json
import random
import re
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
- Внутри JSON обратные слэши удваивай: \\\\frac, \\\\sqrt, \\\\le.
- Все вопросы — multiple choice (kind="mcq"), 4 варианта (id: "a","b","c","d").
- Один правильный вариант, в поле correct_answer указывай его id.
- Не ставь правильный вариант всегда первым: распределяй его по разным позициям.
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
    """Собрать user-промпт для LLM.

    source_fragments — тексты RAG-чанков. Пустой список означает генерацию
    без учебника: правило «только материал ниже» в этом случае заменяем на
    программу 8 класса, иначе модель упрётся в отсутствующий источник.
    """
    head = _PROMPT_HEADER
    if not source_fragments:
        head = head.replace(
            "- Используй ТОЛЬКО материал ниже в разделе «Источник». Ничего не выдумывай.",
            "- Опирайся на школьную программу алгебры и геометрии 8 класса.\n"
            "- Не выдумывай экзотических обозначений и тем вне программы.",
        )
    tail = (
        f"\nТема: {topic}\n"
        f"Сложность: {difficulty}. {_DIFFICULTY_HINT[difficulty]}\n"
        f"Количество вопросов: {items_count}.\n"
    )
    if source_fragments:
        fragments = "\n\n---\n\n".join(source_fragments)
        tail += f"\nИсточник:\n{fragments}\n"
    return head + tail


def parse_generation(
    raw: str, *, rng: random.Random | None = None
) -> list[QuizItem]:
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
        choices, correct = shuffle_choices(
            [Choice(id=c.id, text=c.text.strip()) for c in g.choices],
            g.correct_answer,
            rng=rng,
        )
        items.append(
            QuizItem(
                id=None,
                position=i + 1,
                kind="mcq",
                question_md=g.question_md.strip(),
                choices=choices,
                correct_answer=correct,
                explanation=(g.explanation or "").strip() or None,
            )
        )
    return items


_LETTERS = "abcdefgh"

# «все перечисленные», «ни один из вариантов» и подобные обязаны остаться
# последними — перемешанные, они выглядят поломкой.
_KEEP_LAST_RE = re.compile(
    r"^\s*(все (из )?перечислен|всё (из )?перечислен|ни один|ни одно|никакой|"
    r"нет верного|нет правильного|другое|все варианты|оба варианта)",
    re.IGNORECASE,
)


def shuffle_choices(
    choices: list[Choice],
    correct_id: str,
    *,
    rng: random.Random | None = None,
) -> tuple[list[Choice], str]:
    """Перемешать варианты и перевыдать id a/b/c/d.

    Модель почти всегда ставит правильный ответ первым, и у всего теста
    ответ оказывается «А». Порядок задаём здесь, id присваиваем заново по
    новой позиции, а correct_answer переносим на ту же карточку.
    """
    r = rng or random
    movable = [c for c in choices if not _KEEP_LAST_RE.match(c.text)]
    pinned = [c for c in choices if _KEEP_LAST_RE.match(c.text)]

    order = list(range(len(movable)))
    r.shuffle(order)
    ordered = [movable[i] for i in order] + pinned

    out: list[Choice] = []
    new_correct = correct_id
    for i, c in enumerate(ordered):
        letter = _LETTERS[i] if i < len(_LETTERS) else str(i + 1)
        out.append(Choice(id=letter, text=c.text))
        if c.id == correct_id:
            new_correct = letter
    return out, new_correct


__all__ = [
    "build_generation_prompt",
    "parse_generation",
    "shuffle_choices",
    "ItemKind",
]
