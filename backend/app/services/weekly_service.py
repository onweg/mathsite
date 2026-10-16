"""WeeklyTaskService — use case управления задачей недели.

Инвариант: одновременно опубликована ровно одна задача недели — та, на которой
учитель нажал «опубликовать». Публикация новой снимает прежнюю в одной
транзакции, поэтому двух опубликованных не бывает даже на мгновение.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.core.errors import Conflict, LLMBadResponse, NotFound
from app.domain.chat.types import Message
from app.domain.rag.chunk import Source
from app.domain.weekly.generation import (
    SYSTEM_PROMPT,
    Level,
    build_weekly_prompt,
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

    async def current(self) -> WeeklyTask | None:
        return await self._repo.get_latest_published()

    async def create(
        self, *, title: str, body_md: str, answer_md: str, created_by: UUID
    ) -> WeeklyTask:
        return await self._repo.create(title.strip(), body_md.strip(), answer_md.strip(), created_by)

    async def generate(
        self,
        *,
        topic: str,
        source_key: Source | None,
        level: Level,
        created_by: UUID,
    ) -> WeeklyTask:
        """Черновик задачи недели: RAG по теме → LLM → валидация → запись неопубликованной.

        Публикует учитель вручную, уже посмотрев и поправив текст.
        """
        q_vec = await self._llm.embed(topic, kind="query")
        hits = await self._chunks.semantic_search(
            q_vec,
            source=source_key,
            limit=_RAG_LIMIT,
            min_similarity=_RAG_MIN_SIM,
        )
        if not hits:
            raise Conflict(
                f"По теме «{topic}» не нашлось материала в выбранном источнике. "
                f"Выберите другой источник, смените формулировку темы "
                f"или загрузите нужный PDF в разделе «Материалы»."
            )

        prompt = build_weekly_prompt(
            topic=topic,
            level=level,
            source_fragments=[h.text for h in hits],
        )

        # Одна задача — один шанс на кривой JSON. Вторая попытка холоднее:
        # дешевле, чем заставлять учителя жать кнопку заново.
        last_error: LLMBadResponse | None = None
        for attempt, temperature in enumerate((0.5, 0.15), start=1):
            reply = await self._llm.chat(
                messages=[
                    Message(role="system", text=SYSTEM_PROMPT),
                    Message(role="user", text=prompt),
                ],
                temperature=temperature,
                max_tokens=2500,
            )
            try:
                g = parse_weekly_generation(reply.text)
            except LLMBadResponse as e:
                last_error = e
                log.warning("weekly generation attempt %d failed: %s", attempt, e)
                continue

            log.info(
                "weekly generated · topic=%s · level=%s · chunks=%d · attempt=%d",
                topic, level, len(hits), attempt,
            )
            return await self._repo.create(g.title, g.body_md, g.answer_md, created_by)

        raise last_error or LLMBadResponse("модель не вернула задачу")

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
        """Публикация новой задачи снимает прежнюю: на сайте всегда одна."""
        await self.get(task_id)  # 404, если задачи нет
        await self._repo.publish_only(task_id)
        return await self.get(task_id)

    async def unpublish(self, task_id: UUID) -> WeeklyTask:
        await self._repo.update(task_id, is_published=False)
        return await self.get(task_id)

    async def delete(self, task_id: UUID) -> None:
        await self._repo.delete(task_id)
