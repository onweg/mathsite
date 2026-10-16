"""Вытаскивание JSON из ответа LLM.

Модели регулярно оборачивают JSON в ```json ... ``` или добавляют текст до/после.
Логика одна на всех генераторов (квизы, задача недели), поэтому живёт здесь.

Отдельная боль — LaTeX внутри JSON-строк. Модель пишет «$\\frac{1}{2}$», но в
JSON одиночный обратный слэш начинает escape-последовательность. Часть из них
невалидна (`\\c`, `\\s`, `\\l` — разбор падает), а часть формально валидна и
тихо съедает команду: `\\frac` превращается в перевод формата + «rac»,
`\\times` — в табуляцию + «imes». Поэтому перед разбором чиним экранирование.
"""

from __future__ import annotations

import re

from app.core.errors import LLMBadResponse

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_HEX4_RE = re.compile(r"[0-9a-fA-F]{4}")

# Что оставляем как настоящий JSON-escape. `\n` в списке намеренно: переносы
# строк в пояснениях встречаются чаще, чем команды \neq и \nabla. Всё
# остальное (включая валидные \t, \f, \b, \r) считаем LaTeX'ом и удваиваем —
# табуляции и перевода формата в условии задачи не бывает.
_KEEP_AS_ESCAPE = {'"', "\\", "/", "n"}


def repair_latex_escapes(raw: str) -> str:
    """Удвоить обратные слэши, которые JSON принял бы не так, как задумано."""
    out: list[str] = []
    i = 0
    n = len(raw)
    while i < n:
        ch = raw[i]
        if ch != "\\" or i + 1 >= n:
            out.append(ch)
            i += 1
            continue

        nxt = raw[i + 1]
        if nxt in _KEEP_AS_ESCAPE:
            out.append(ch)
            out.append(nxt)
            i += 2
        elif nxt == "u" and _HEX4_RE.fullmatch(raw[i + 2 : i + 6] or ""):
            # настоящий \uXXXX, а не начало \underline
            out.append(raw[i : i + 6])
            i += 6
        else:
            out.append("\\\\")
            out.append(nxt)
            i += 2
    return "".join(out)


def extract_json(text: str) -> str:
    m = _JSON_FENCE_RE.search(text)
    if m:
        return repair_latex_escapes(m.group(1))
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise LLMBadResponse("модель не вернула JSON")
    return repair_latex_escapes(text[start : end + 1])


__all__ = ["extract_json", "repair_latex_escapes"]
