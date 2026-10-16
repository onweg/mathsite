"""PollsService — опросы и обратная связь от учеников.

Опрос живёт по тем же правилам, что задача недели: учитель создаёт черновик,
публикует вручную, снятие публикации закрывает приём ответов. Ученик по QR
может переголосовать — новый ответ перезаписывает прежний.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.core.errors import Conflict, NotFound
from app.domain.poll.types import Poll, PollAnswer, PollKind, PollOption, PollResults
from app.domain.student.types import Student
from app.infrastructure.repositories.polls_repo import PollsRepository

log = logging.getLogger("mathsite.polls")

MAX_OPTIONS = 10
MAX_COMMENT = 1000


class PollsService:
    def __init__(self, repo: PollsRepository):
        self._repo = repo

    # ---------- чтение ----------

    async def list(self) -> list[Poll]:
        return await self._repo.list()

    async def list_published(self, student: Student | None = None) -> list[Poll]:
        """Открытые опросы. Вошедшему по QR не показываем те, где он уже ответил:
        главная страница держит только актуальное, история живёт в профиле."""
        polls = await self._repo.list(published_only=True)
        if not student:
            return polls
        answered = await self._repo.answered_ids(student.id)
        return [p for p in polls if p.id not in answered]

    async def my_answers(
        self, student: Student
    ) -> list[tuple[PollAnswer, str, list[PollOption]]]:
        return await self._repo.answers_by_student(student.id)

    async def get(self, poll_id: UUID) -> Poll:
        poll = await self._repo.get(poll_id)
        if not poll:
            raise NotFound(f"опрос {poll_id} не найден")
        return poll

    async def counts(self) -> dict[UUID, int]:
        return await self._repo.counts()

    # ---------- учитель ----------

    async def create(
        self,
        *,
        title: str,
        question_md: str,
        kind: PollKind,
        multiple: bool,
        allow_comment: bool,
        options: list[str],
        created_by: UUID | None,
    ) -> Poll:
        options = _clean_options(options)
        if kind == "choice" and len(options) < 2:
            raise Conflict("в опросе с вариантами нужно минимум два варианта")
        if kind == "text":
            options = []
        return await self._repo.create(
            title=title.strip(),
            question_md=question_md.strip(),
            kind=kind,
            multiple=multiple if kind == "choice" else False,
            # у текстового опроса ответ и есть комментарий
            allow_comment=True if kind == "text" else allow_comment,
            options=options,
            created_by=created_by,
        )

    async def update(
        self,
        poll_id: UUID,
        *,
        title: str | None = None,
        question_md: str | None = None,
        multiple: bool | None = None,
        allow_comment: bool | None = None,
        options: list[str] | None = None,
    ) -> Poll:
        poll = await self.get(poll_id)
        if options is not None:
            if poll.kind == "text":
                raise Conflict("у текстового опроса нет вариантов ответа")
            options = _clean_options(options)
            if len(options) < 2:
                raise Conflict("нужно минимум два варианта")
        await self._repo.update(
            poll_id,
            title=title.strip() if title else None,
            question_md=question_md.strip() if question_md is not None else None,
            multiple=multiple,
            allow_comment=allow_comment,
            options=options,
        )
        return await self.get(poll_id)

    async def publish(self, poll_id: UUID) -> Poll:
        await self._repo.update(poll_id, is_published=True)
        return await self.get(poll_id)

    async def unpublish(self, poll_id: UUID) -> Poll:
        await self._repo.update(poll_id, is_published=False)
        return await self.get(poll_id)

    async def delete(self, poll_id: UUID) -> None:
        await self._repo.delete(poll_id)

    async def results(self, poll_id: UUID) -> PollResults:
        poll = await self.get(poll_id)
        return PollResults(
            poll_id=poll.id,  # type: ignore[arg-type]
            total_answers=await self._repo.answers_count(poll_id),
            tallies=await self._repo.tallies(poll_id),
            comments=await self._repo.answers_with_comments(poll_id),
        )

    # ---------- ученик ----------

    async def answer(
        self,
        poll_id: UUID,
        *,
        student: Student | None,
        student_name: str,
        option_ids: list[UUID],
        comment: str,
    ) -> PollAnswer:
        poll = await self.get(poll_id)
        if not poll.is_published:
            raise Conflict("опрос закрыт")

        comment = comment.strip()
        if len(comment) > MAX_COMMENT:
            raise Conflict(f"ответ длиннее {MAX_COMMENT} символов")

        if poll.kind == "text":
            option_ids = []
            if not comment:
                raise Conflict("напиши ответ")
        else:
            known = {o.id for o in poll.options}
            unknown = [o for o in option_ids if o not in known]
            if unknown:
                raise Conflict("выбран несуществующий вариант")
            if not poll.multiple and len(option_ids) > 1:
                raise Conflict("в этом опросе можно выбрать только один вариант")
            if not option_ids and not comment:
                raise Conflict("выбери вариант или напиши свой ответ")
            if not poll.allow_comment:
                comment = ""

        name = student.name if student else (student_name.strip() or "аноним")
        answer = await self._repo.upsert_answer(
            poll_id=poll_id,
            student_id=student.id if student else None,
            student_name=name[:120],
            class_label=student.class_label if student else "",
            option_ids=option_ids,
            comment=comment,
        )
        log.info(
            "poll answer · poll=%s · student=%s · options=%d",
            poll_id, answer.student_id or "anon", len(option_ids),
        )
        return answer

    async def my_answer(self, poll_id: UUID, student: Student) -> PollAnswer | None:
        return await self._repo.get_answer_for_student(poll_id, student.id)


def _clean_options(options: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in options:
        text = raw.strip()
        if not text or text.lower() in seen:
            continue
        seen.add(text.lower())
        out.append(text[:200])
    if len(out) > MAX_OPTIONS:
        raise Conflict(f"не больше {MAX_OPTIONS} вариантов")
    return out
