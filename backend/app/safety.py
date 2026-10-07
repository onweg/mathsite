"""Pre-filter и post-filter — regex-защита без LLM.

Слой 1: проверка сообщения ученика до отправки в модель.
Слой 4: проверка ответа модели до показа ученику.
"""

import re
from dataclasses import dataclass
from typing import Literal

MAX_USER_MSG_LEN = 500  # школьный вопрос редко длиннее
MAX_SYSTEM_LEAK_LEN = 50  # ответ не должен содержать длинных кусков инструкций

# --- Чёрные списки ---------------------------------------------------------

# Слова и короткие n-граммы, после которых не идём в LLM.
# Нормализуем сообщение (lower, убираем знаки), ищем по границам слов.
_FORBIDDEN_WORDS: tuple[str, ...] = (
    # политика / власть / конфликты
    "политик", "выбор", "путин", "трамп", "байден", "зеленск", "лукашенк",
    "кремл", "партия", "оппозиц", "митинг", "протест", "санкц",
    "война", "военн", "сво", "мобилизац", "фронт", "окопы", "украин", "росси",
    "нато", "запад против", "запад и россия", "крым",
    # оружие / насилие / опасное
    "оружи", "пистолет", "винтовк", "автомат ", "пулемет", "гранат", "взрывч",
    "бомб", "теракт", "убийств", "самоубийств", "суицид", "повеситься", "суицид",
    "наркотик", "кокаин", "героин", "марихуан", "алкогол", "сигарет", "курить",
    "насилие", "избиение", "драк",
    # 18+ и личное
    "порно", "секс", "эротик", "интим", "мастурб", "член", "влагалищ", "грудь",
    "раздеть", "голый", "голая",
    # религия и чувствительное
    "бог", "аллах", "иисус", "библия", "коран", "церков", "мечет", "ислам",
    "христиан", "иудей", "буддизм", "религи", "ислам", "нацизм", "фашизм",
    # jailbreak-паттерны (русский + английский)
    "забудь инструкц", "забудь все", "игнорируй инструкц", "игнорируй правил",
    "ignore previous", "ignore all", "system prompt", "твой промпт", "твой системный",
    "твои правила", "твои инструкц", "раскрой инструкц", "выведи промпт",
    "представь что ты", "представь себя", "ты теперь", "теперь ты",
    "режим без ограничен", "без ограничений", "режим dan", " dan ", "jailbreak",
    "roleplay", "role-play", "ролевая игра", "пиши от лица",
    "ответь на английском", "answer in english", "switch to english",
    "repeat after me", "повтори за мной",
    # прочие небезопасные темы
    "как взломать", "как обойти", "как украсть", "рецепт", "медикамент",
    "диагноз", "лечение", "инвестиц", "биржа", "крипто",
)

# PII — личные данные, при обнаружении отказываем или редактируем
_PII_PATTERNS = [
    (re.compile(r"\+?\d[\d\s\-()]{9,}\d"), "<телефон>"),              # телефон
    (re.compile(r"[\w.\-]+@[\w.\-]+\.\w{2,}"), "<email>"),            # email
    (re.compile(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b"), "<карта>"),  # карта
    (re.compile(r"\b\d{4}\s?\d{6}\b"), "<паспорт>"),                  # паспорт РФ
]

# Паттерны, намекающие что ответ раскрывает system prompt (слой 4)
_SYSTEM_LEAK_HINTS = (
    "моя инструкция", "мой системный", "мой промпт", "мне было сказано",
    "мне поручили", "моя задача — отказ", "правила для меня",
    "yandexgpt", "openai", "anthropic", "claude", "chatgpt", "gpt-",
)

# ---------------------------------------------------------------------------

Verdict = Literal["ok", "blocked", "too_long", "empty", "pii"]


@dataclass
class CheckResult:
    verdict: Verdict
    reason: str = ""
    cleaned: str = ""   # сообщение после PII-редактирования

    @property
    def passed(self) -> bool:
        return self.verdict == "ok"


def _normalize(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^а-яёa-z0-9\s]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _mask_pii(s: str) -> tuple[str, bool]:
    """Возвращает (строка с заменами, был ли найден PII)."""
    masked = s
    found = False
    for pat, repl in _PII_PATTERNS:
        new = pat.sub(repl, masked)
        if new != masked:
            found = True
            masked = new
    return masked, found


def check_user_message(text: str) -> CheckResult:
    """Слой 1 — pre-filter входящего сообщения."""
    stripped = (text or "").strip()
    if not stripped:
        return CheckResult(verdict="empty", reason="пустое сообщение")
    if len(stripped) > MAX_USER_MSG_LEN:
        return CheckResult(
            verdict="too_long",
            reason=f"сообщение длиннее {MAX_USER_MSG_LEN} символов",
        )

    masked, has_pii = _mask_pii(stripped)
    if has_pii:
        # не блокируем, но подменяем PII маркерами перед отправкой в LLM и в логи
        stripped = masked

    normalized = _normalize(stripped)
    for word in _FORBIDDEN_WORDS:
        if word in normalized:
            return CheckResult(verdict="blocked", reason=f"forbidden:{word}")

    return CheckResult(verdict="ok", cleaned=stripped)


def check_assistant_reply(text: str) -> CheckResult:
    """Слой 4 — post-filter ответа модели."""
    if not text or not text.strip():
        return CheckResult(verdict="empty")

    lowered = text.lower()
    for hint in _SYSTEM_LEAK_HINTS:
        if hint in lowered:
            return CheckResult(verdict="blocked", reason=f"system_leak:{hint}")

    # ответ не должен содержать явно запрещённую лексику (мало ли, модель повторила)
    normalized = _normalize(text)
    for word in _FORBIDDEN_WORDS:
        # для post-filter берём только самые жёсткие — политика/18+/насилие
        if word in {
            "политик", "путин", "трамп", "война", "военн", "оружи",
            "суицид", "наркотик", "порно", "секс", "теракт", "убийств",
            "религи", "нацизм", "фашизм",
        } and word in normalized:
            return CheckResult(verdict="blocked", reason=f"forbidden_in_reply:{word}")

    return CheckResult(verdict="ok", cleaned=text)
