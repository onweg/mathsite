"""Генерация квиза LLM: промпт + Pydantic-валидация ответа.

Схема ответа модели — строгий JSON, который валидируется и мапится в домен.
Если модель отдала невалидный JSON — поднимаем LLMBadResponse, зовущий повторит запрос.

Отдельная история — качество источника. Текст учебника извлечён из PDF, и
двумерная вёрстка формул при этом теряется: дробь $\\frac{ab^3}{24}$ приходит
строкой «a b 3 24», знак умножения — как «/mat7». Модель, которой велено
«использовать только материал», честно переписывает эту кашу в условие. Поэтому
источник задаёт тему и типаж, а формулы модель составляет сама; то, что всё-таки
просочилось, ловит `looks_garbled` и отправляет генерацию на вторую попытку.
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


_SOURCE_RULE = """- Материал в разделе «Источник» задаёт тему, терминологию и типаж задач. Бери оттуда смысл, а не текст.
- ВАЖНО: источник извлечён из PDF, и формулы в нём разрушены. Дробь приходит строкой
  («a b 3 24» — это $\\\\frac{ab^3}{24}$), знак умножения — обрывком вроде «/mat7»,
  большие скобки — набором букв «ж из ц шч». Восстанавливай смысл и записывай формулу заново.
- Никогда не переписывай выражения из источника дословно. Каждую формулу в вопросе и в
  вариантах составляй сам и записывай корректным LaTeX."""

_NO_SOURCE_RULE = """- Опирайся на школьную программу алгебры и геометрии 8 класса.
- Не выдумывай экзотических обозначений и тем вне программы."""

_PROMPT_HEADER = """Ты составляешь тест по математике для 8 класса российской школы.

Правила:
{source_rule}
- Отвечай строго валидным JSON по приведённой схеме. Без комментариев, без текста до/после.
- Формат математики — LaTeX inline: $x^2 + 1$. Блочных формул не используй.
- Внутри JSON обратные слэши удваивай: \\\\frac, \\\\sqrt, \\\\le.
- Все вопросы — multiple choice (kind="mcq"), обычно 4 варианта (id: "a","b","c","d").
- Один правильный вариант, в поле correct_answer указывай его id.
- Не ставь правильный вариант всегда первым: распределяй его по разным позициям.
- Вопрос с вариантами «Верно»/«Неверно» допустим, но тогда примерно половина утверждений
  должна быть ЛОЖНОЙ. Тест, где на каждое «верно ли, что…» ответ «верно», ничего не проверяет.
- Варианты должны быть правдоподобно похожи, различия — тонкие (знак, степень, порядок, типичная ошибка).
- Короткие формулировки. Текст условия — не длиннее 2 предложений.
- Разнообразь: расчётные, концептуальные, на преобразование.

Схема ответа:
{{
  "items": [
    {{
      "kind": "mcq",
      "question_md": "строка",
      "choices": [
        {{"id": "a", "text": "..."}},
        {{"id": "b", "text": "..."}},
        {{"id": "c", "text": "..."}},
        {{"id": "d", "text": "..."}}
      ],
      "correct_answer": "a",
      "explanation": "краткое объяснение почему именно этот ответ"
    }}
  ]
}}
"""


_DIFFICULTY_HINT: dict[Difficulty, str] = {
    "easy": "Простые задачи на прямое применение определений.",
    "medium": "Среднего уровня: 1-2 шага преобразования, проверка понимания.",
    "hard": "Повышенной сложности: несколько шагов, типичные ловушки.",
}


def _header(*, with_source: bool) -> str:
    return _PROMPT_HEADER.format(
        source_rule=_SOURCE_RULE if with_source else _NO_SOURCE_RULE
    )


def _hint_block(hint: str | None) -> str:
    """Пожелание учителя отдельным блоком — в поиск по учебнику оно не идёт."""
    clean = (hint or "").strip()
    return f"\nПожелания учителя (выполни их, если они не противоречат правилам выше):\n{clean}\n" if clean else ""


def _source_block(source_fragments: list[str]) -> str:
    if not source_fragments:
        return ""
    return "\nИсточник:\n" + "\n\n---\n\n".join(source_fragments) + "\n"


def build_generation_prompt(
    *,
    topic: str,
    difficulty: Difficulty,
    items_count: int,
    source_fragments: list[str],
    hint: str | None = None,
) -> str:
    """Собрать user-промпт для LLM.

    source_fragments — тексты RAG-чанков. Пустой список означает генерацию
    без учебника: правило «опирайся на источник» в этом случае заменяем на
    программу 8 класса, иначе модель упрётся в отсутствующий источник.
    """
    return (
        _header(with_source=bool(source_fragments))
        + f"\nТема: {topic}\n"
        + f"Сложность: {difficulty}. {_DIFFICULTY_HINT[difficulty]}\n"
        + f"Количество вопросов: {items_count}.\n"
        + _hint_block(hint)
        + _source_block(source_fragments)
    )


def render_items(items: list[QuizItem]) -> str:
    """Текущий черновик в человекочитаемом виде — вход для доработки."""
    lines: list[str] = []
    for item in items:
        lines.append(f"Вопрос {item.position}: {item.question_md}")
        for choice in item.choices:
            mark = " ← правильный" if choice.id == item.correct_answer else ""
            lines.append(f"  {choice.id}) {choice.text}{mark}")
        if item.explanation:
            lines.append(f"  пояснение: {item.explanation}")
        lines.append("")
    return "\n".join(lines).strip()


def build_refine_prompt(
    *,
    topic: str,
    difficulty: Difficulty,
    items: list[QuizItem],
    instruction: str,
    source_fragments: list[str],
) -> str:
    """Промпт доработки: текущий черновик + замечание учителя.

    Смысл — переработка, а не новая генерация. Модель видит, что уже написано,
    и меняет только то, о чём попросили: вопросы, которых замечание не касается,
    должны вернуться слово в слово. Иначе учитель, поправив один вопрос, получал
    бы заново весь тест и вычитывал его с нуля.
    """
    return (
        _header(with_source=bool(source_fragments))
        + "\nЭто ДОРАБОТКА уже готового черновика, а не новый тест.\n"
        + "- Верни полный список вопросов целиком, в том же формате JSON.\n"
        + "- Вопросы, которых замечание не касается, перенеси без изменений, слово в слово.\n"
        + "- Количество вопросов менять можно, только если учитель прямо об этом просит.\n"
        + f"\nТема: {topic}\n"
        + f"Сложность: {difficulty}. {_DIFFICULTY_HINT[difficulty]}\n"
        + f"\nТекущий черновик:\n{render_items(items)}\n"
        + f"\nЗамечание учителя:\n{instruction.strip()}\n"
        + _source_block(source_fragments)
    )


# --------------------------------------------------------------------------- #
# Детектор мусора из PDF
# --------------------------------------------------------------------------- #

#: Имена глиф из математического шрифта, у которых нет юникод-маппинга: «/mat7».
_GLYPH_RE = re.compile(r"/(?:mat|uni|glyph|cmr|cmmi|cmsy)\d", re.IGNORECASE)
#: «ab324» — склейка числителя со знаменателем. Настоящая переменная с тремя
#: цифрами подряд в школьной математике не встречается, а LaTeX-дробь сюда не
#: попадает: там между буквами и цифрами стоят `^`, `{` и `}`.
#: Обратный порядок («21bc») не проверяем: это обычный коэффициент перед
#: переменными, и от мусора вида «62ba» его не отличить.
_GLUED_TAIL_RE = re.compile(r"[A-Za-zА-Яа-яё]{1,4}\d{3,}")
#: «a b 3 24» — дробь, рассыпавшаяся на отдельно стоящие символы.
_LONE_LETTERS_RE = re.compile(r"(?:(?<![\w\\$])[A-Za-zА-Яа-яё0-9](?![\w$])\s+){3,}")
#: «$a^2b^2128$» — степень, слипшаяся со знаменателем.
_GLUED_SUP_RE = re.compile(r"\^\d{3,}")
#: «xxxx» — один и тот же символ, размноженный извлечением.
_REPEATED_RE = re.compile(r"([A-Za-zА-Яа-яё])\1{2,}")
#: «121 + +», «– : + –+» — операторы, оставшиеся без операндов. Первым идёт
#: только настоящий знак операции: тире в начале — это «Ответ — −5», а не мусор.
_DANGLING_OPS_RE = re.compile(r"[+*/]\s*[+*/−–—-]|[-]\s+[+*/−–—-]")


def looks_garbled(text: str) -> bool:
    """Похоже ли, что кусок переписан из разрушенного текстового слоя PDF."""
    return bool(
        _GLYPH_RE.search(text)
        or _GLUED_TAIL_RE.search(text)
        or _GLUED_SUP_RE.search(text)
        or _LONE_LETTERS_RE.search(text)
        or _REPEATED_RE.search(text)
        or _DANGLING_OPS_RE.search(text)
    )


# --------------------------------------------------------------------------- #
# Баланс «верно / неверно»
# --------------------------------------------------------------------------- #

_TF_TRUE = {"верно", "да", "истина", "правда", "истинно", "верное утверждение"}
_TF_FALSE = {"неверно", "нет", "ложь", "ложно", "не верно", "неверное утверждение"}


def _norm(text: str) -> str:
    return re.sub(r"[\s.!,;:]+", " ", text.strip().lower()).strip()


def _tf_truth(item: GQuizItem) -> bool | None:
    """True/False, если это вопрос «верно или неверно»; иначе None.

    Возвращает, какой вариант объявлен правильным: True — «верно».
    """
    if len(item.choices) != 2:
        return None
    by_id = {c.id: _norm(c.text) for c in item.choices}
    texts = set(by_id.values())
    if not (texts & _TF_TRUE and texts & _TF_FALSE):
        return None
    return by_id.get(item.correct_answer) in _TF_TRUE


def _check_tf_balance(items: list[GQuizItem]) -> None:
    """Не пропускать тест, где на каждое «верно ли, что…» ответ «верно».

    Проверять есть смысл от двух таких вопросов: на одном «всегда верно» — не
    закономерность. Исправить это кодом нельзя (ключ не перевернёшь, не
    переписав утверждение), поэтому отправляем генерацию на вторую попытку.
    """
    truths = [t for t in (_tf_truth(i) for i in items) if t is not None]
    if len(truths) >= 2 and all(truths):
        raise LLMBadResponse(
            f"во всех вопросах «верно/неверно» ({len(truths)} шт.) правильный ответ "
            "«верно» — примерно половина утверждений должна быть ложной"
        )


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

    _check_tf_balance(parsed.items)

    items: list[QuizItem] = []
    for i, g in enumerate(parsed.items):
        ids = {c.id for c in g.choices}
        if g.correct_answer not in ids:
            raise LLMBadResponse(
                f"item {i}: correct_answer={g.correct_answer!r} не входит в варианты {sorted(ids)}"
            )
        if looks_garbled(g.question_md):
            raise LLMBadResponse(
                f"item {i}: формула переписана из повреждённого текста учебника: {g.question_md[:80]!r}"
            )
        for c in g.choices:
            if looks_garbled(c.text):
                raise LLMBadResponse(
                    f"item {i}: вариант {c.id} переписан из повреждённого текста: {c.text[:80]!r}"
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
    "build_refine_prompt",
    "looks_garbled",
    "parse_generation",
    "render_items",
    "shuffle_choices",
    "ItemKind",
]
