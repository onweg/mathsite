"""Privacy boundary: raw database strings/IDs never enter the model's context."""
import math

from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

PAGE_NAMES = {
    'home': 'Главная', 'ai': 'ИИ-теоретик', 'missed': 'Пропустил урок',
    'weekly': 'Задача недели', 'quizzes': 'Тесты', 'library': 'Библиотека',
    'around': 'Математика вокруг нас', 'olympiad': 'Олимпиады',
    'oge': 'ОГЭ', 'ege': 'ЕГЭ', 'feedback': 'Опросы', 'profile': 'Личный кабинет',
}
FIELDS = {
    'site': ('visits', 'visitors', 'active_seconds', 'quiz_attempts', 'library_events', 'weekly_submissions', 'poll_answers'),
    'quizzes': ('attempts', 'learners', 'anonymous_attempts', 'average_score', 'first_attempts', 'first_average_score', 'repeat_attempts', 'first_high_scores', 'first_low_scores'),
    'materials': ('views', 'readers', 'article_opens', 'file_opens', 'link_clicks'),
    'sections': ('opens', 'visits', 'visitors', 'active_seconds'),
    'weekly': ('submissions', 'pending', 'correct', 'partial', 'wrong'),
    'polls': ('answers',),
}


def numbers(row: dict, fields: tuple[str, ...]) -> dict:
    out = {}
    for field in fields:
        value = row.get(field)
        if value is None:
            out[field] = None
        else:
            value = float(value)
            out[field] = round(value, 1) if math.isfinite(value) else None
    return out


def build_snapshot(raw: dict) -> tuple[dict, dict, dict]:
    """Explicit allowlist, not recursive redaction of an arbitrary report.

    Even catalog titles can contain names, links or pasted API keys. Keep them
    exclusively in the local reference map, then restore them AFTER inference.
    """
    site = numbers(raw['site'], FIELDS['site'])
    payload = {'site': {'ref': 'SITE', **site}}
    entities = {'SITE': {'title': 'Сайт в целом', 'kind': 'site', 'metrics': site}}
    coverage = {}
    limits = {'quizzes': 60, 'materials': 80, 'sections': 12, 'weekly': 20, 'polls': 20}
    prefixes = {'quizzes': 'Q', 'materials': 'M', 'sections': 'S', 'weekly': 'W', 'polls': 'P'}
    for group, limit in limits.items():
        rows = raw.get(group, [])
        # The repository sorts by usage. Preserve both popular and rarely used
        # items when a large catalog won't fit the context; disclose the omission.
        selected = rows if len(rows) <= limit else rows[:limit // 2] + rows[-limit // 2:]
        coverage[group] = {'total': len(rows), 'included': len(selected)}
        items = []
        for index, row in enumerate(selected, 1):
            ref = f'{prefixes[group]}{index}'
            metrics = numbers(row, FIELDS[group])
            item = {'ref': ref, **metrics}
            if 'published' in row:
                item['published_now'] = row['published'] is True
            if group == 'materials':
                item['collection'] = row.get('collection') if row.get('collection') in ('around', 'olympiad', 'oge', 'ege') else 'other'
                item['format'] = row.get('kind') if row.get('kind') in ('article', 'link', 'file') else 'other'
            if group == 'sections':
                item['section'] = row.get('page') if row.get('page') in PAGE_NAMES else 'other'
                title = PAGE_NAMES.get(row.get('page'), 'Раздел сайта')
            else:
                title = str(row.get('title') or 'Без названия')[:300]
            entities[ref] = {'title': title, 'kind': group, 'metrics': metrics}
            items.append(item)
        payload[group] = items
    payload['coverage'] = coverage
    return payload, entities, coverage


class Finding(BaseModel):
    model_config = ConfigDict(extra='forbid')
    ref: str = Field(max_length=12)
    observation: str = Field(min_length=1, max_length=800)
    recommendation: str = Field(min_length=1, max_length=800)
    confidence: Literal['low', 'medium', 'high']


class NextStep(BaseModel):
    model_config = ConfigDict(extra='forbid')
    ref: str = Field(max_length=12)
    action: str = Field(min_length=1, max_length=600)
    check: str = Field(min_length=1, max_length=400)


class ModelInsights(BaseModel):
    model_config = ConfigDict(extra='forbid')
    summary: str = Field(min_length=1, max_length=1500)
    findings: list[Finding] = Field(min_length=1, max_length=10)
    next_steps: list[NextStep] = Field(min_length=1, max_length=5)
    limitations: list[str] = Field(max_length=8)


SYSTEM_PROMPT = '''Ты помогаешь учителю математики планировать материалы и тесты по статистике школьного сайта.
На входе только обезличенные числовые агрегаты и условные ссылки на объекты (ref).
Названий и содержания материалов, ответов учеников, имён, классов и секретов у тебя нет.
Не выдумывай тематику, названия, причины поведения и отсутствующие показатели.
Не делай выводов об отдельных учениках и не определяй, кто скрывается за данными.

Дай конкретные выводы: интерес к материалам, малоиспользуемые материалы, участие в тестах,
предположительно лёгкие/сложные тесты, что дать ещё и что сначала проверить или переработать.
Всегда опирайся на числа и объём выборки. Отделяй наблюдения от гипотез.
Для сложности важнее first_average_score по ПЕРВЫМ за всю историю попыткам вошедших учеников,
совершённым в выбранном периоде. first_attempts — их число. average_score включает повторы и гостей.
При first_attempts < 5 уверенность в сложности только low; даже при 5+ это сигнал, не доказательство.
repeat_attempts — повторные попытки вошедших учеников в периоде, даже если первая была раньше.
first_high_scores — число первых результатов >=80%, first_low_scores — <50%.
Не утверждай «тест лёгкий» только из-за высокого среднего после повторов.

Просмотр не означает симпатию или прочтение. Ноль просмотров не означает «не любят»:
нет числа показов, дат публикации, обязательности задания и времени доступности.
published_now — публикация СЕЙЧАС, не весь выбранный период. Не сравнивай объекты как равнодоступные.
Активное время приблизительное и только с момента внедрения трекинга; нулевые посещения
при ненулевых старых результатах означают возможное отсутствие трекинга, а не отсутствие учеников.
Библиотека подавляет одинаковые действия ученика в течение 15 минут.
Задачи недели и опросы содержат текущие сохранённые ответы, а не историю переотправок;
непроверенные решения нельзя считать неверными. Тексты ответов опросов не переданы — предпочтения неизвестны.
Если coverage.included < coverage.total, общие показатели сайта полные, но сравнение объектов частичное.

Ответ по-русски, только JSON:
{"summary":"краткий итог", "findings":[{"ref":"Q1", "observation":"наблюдение с цифрами и осторожной интерпретацией", "recommendation":"конкретное действие учителю", "confidence":"low|medium|high"}],
"next_steps":[{"ref":"SITE", "action":"приоритетное действие на следующую неделю", "check":"как проверить результат действия"}],
"limitations":["существенное ограничение данных"]}
В ref используй ТОЛЬКО переданные ссылки. Не повторяй ref в тексте: название подставит приложение.
До 10 выводов и 5 шагов. Не заполняй список ради количества. Не выводи URL, команды или HTML.
'''
