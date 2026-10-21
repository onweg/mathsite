"""WeeklyTaskService — use case управления задачами недели.

На сайте висит столько задач, сколько учитель опубликовал: одна, три или
десяток. Снимается каждая отдельно. Решения привязаны к id задачи, поэтому
публикация и снятие с публикации на уже присланные решения не влияют.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.core.errors import Conflict, LLMBadResponse, NoSourceMaterial, NotFound
from app.domain.chat.types import Message
from app.domain.rag.chunk import Source
from app.domain.weekly.generation import (
    SYSTEM_PROMPT,
    GWeeklyTask,
    Level,
    build_weekly_prompt,
    build_weekly_refine_prompt,
    parse_weekly_generation,
)
from app.domain.weekly.types import WeeklyTask
from app.infrastructure.llm.base import LLMProvider
from app.infrastructure.repositories.chunks_repo import ChunksRepository
from app.infrastructure.repositories.weekly_repo import WeeklyTasksRepository

log = logging.getLogger("mathsite.weekly")

_RAG_LIMIT = 8
_RAG_MIN_SIM = 0.4


class WeeklyTaskService:
    def __init__(
        self,
        repo: WeeklyTasksRepository,
        llm: LLMProvider,
        chunks: ChunksRepository,
    ):
        self._repo = repo
        self._llm = llm
        self._chunks = chunks

    async def list(self) -> list[WeeklyTask]:
        return await self._repo.list()

    async def get(self, task_id: UUID) -> WeeklyTask:
        task = await self._repo.get(task_id)
        if not task:
            raise NotFound(f"задача {task_id} не найдена")
        return task

    async def published(self) -> list[WeeklyTask]:
        """Задачи, которые сейчас на сайте, в порядке добавления."""
        return await self._repo.list_published()

    async def create(
        self, *, title: str, body_md: str, answer_md: str, created_by: UUID
    ) -> WeeklyTask:
        return await self._repo.create(title.strip(), body_md.strip(), answer_md.strip(), created_by)

    async def _find_source(self, topic: str, source_key: Source | None):
        q_vec = await self._llm.embed(topic, kind="query")
        return await self._chunks.semantic_search(
            q_vec,
            source=source_key,
            limit=_RAG_LIMIT,
            min_similarity=_RAG_MIN_SIM,
        )

    async def _ask_model(self, user_prompt: str) -> GWeeklyTask:
        """Спросить модель с повтором, называя ей причину отказа.

        Одна задача — один шанс на кривой JSON. Следующая попытка холоднее и
        с текстом претензии: без объяснения модель повторяет ту же ошибку.
        """
        last_error: LLMBadResponse | None = None
        for attempt, temperature in enumerate((0.5, 0.25, 0.15), start=1):
            reply = await self._llm.chat(
                messages=[
                    Message(role="system", text=SYSTEM_PROMPT),
                    Message(role="user", text=_with_retry_note(user_prompt, last_error)),
                ],
                temperature=temperature,
                max_tokens=2500,
            )
            try:
                return parse_weekly_generation(reply.text)
            except LLMBadResponse as e:
                last_error = e
                log.warning("weekly generation attempt %d failed: %s", attempt, e)
        raise last_error or LLMBadResponse("модель не вернула задачу")

    async def generate(
        self,
        *,
        topic: str,
        source_key: Source | None,
        level: Level,
        created_by: UUID,
        allow_without_source: bool = False,
        use_materials: bool = True,
        hint: str | None = None,
    ) -> WeeklyTask:
        """Черновик задачи недели: RAG по теме → LLM → валидация → запись неопубликованной.

        Публикует учитель вручную, уже посмотрев и поправив текст.
        """
        hits = await self._find_source(topic, source_key) if use_materials else []
        if use_materials and not hits and not allow_without_source:
            raise NoSourceMaterial(
                f"По теме «{topic}» не нашлось материала в выбранном источнике. "
                f"Выберите другой источник, смените формулировку темы "
                f"или загрузите нужный PDF в разделе «Материалы»."
            )

        g = await self._ask_model(
            build_weekly_prompt(
                topic=topic,
                level=level,
                source_fragments=[h.text for h in hits],
                hint=hint,
            )
        )
        log.info(
            "weekly generated · topic=%s · level=%s · chunks=%d",
            topic, level, len(hits),
        )
        return await self._repo.create(g.title, g.body_md, g.answer_md, created_by)

    async def refine(
        self, task_id: UUID, *, instruction: str, level: Level = "olympiad"
    ) -> WeeklyTask:
        """Переработать задачу по замечанию учителя.

        Разрешено и для опубликованной: к тексту задачи ничего не привязано,
        решения учеников ссылаются на её id. Фронт предупреждает, что правка
        видна на сайте сразу.

        В учебник при доработке не ходим: у задачи не сохранены ни тема, ни
        источник, искать было бы не по чему. Контекст — сам текст задачи.
        """
        task = await self.get(task_id)
        g = await self._ask_model(
            build_weekly_refine_prompt(
                title=task.title,
                body_md=task.body_md,
                answer_md=task.answer_md,
                level=level,
                instruction=instruction,
                source_fragments=[],
            )
        )
        await self._repo.update(
            task_id, title=g.title, body_md=g.body_md, answer_md=g.answer_md
        )
        log.info("weekly refined · id=%s · instruction=%s", task_id, instruction[:120])
        return await self.get(task_id)

    async def update(
        self,
        task_id: UUID,
        *,
        title: str | None = None,
        body_md: str | None = None,
        answer_md: str | None = None,
    ) -> WeeklyTask:
        await self._repo.update(
            task_id,
            title=title.strip() if title else None,
            body_md=body_md.strip() if body_md else None,
            answer_md=answer_md.strip() if answer_md else None,
        )
        return await self.get(task_id)

    async def publish(self, task_id: UUID) -> WeeklyTask:
        """Повесить задачу на сайт рядом с уже опубликованными."""
        await self.get(task_id)  # 404, если задачи нет
        await self._repo.update(task_id, is_published=True)
        return await self.get(task_id)

    async def unpublish(self, task_id: UUID) -> WeeklyTask:
        await self._repo.update(task_id, is_published=False)
        return await self.get(task_id)

    async def delete(self, task_id: UUID) -> None:
        await self._repo.delete(task_id)


def _with_retry_note(prompt: str, error: LLMBadResponse | None) -> str:
    """Дописать к промпту, чем не понравилась прошлая попытка."""
    if error is None:
        return prompt
    return (
        f"{prompt}\n\nПрошлый твой ответ отклонён проверкой: {error}.\n"
        "Напиши задачу заново по тем же требованиям и обязательно исправь это."
    )
