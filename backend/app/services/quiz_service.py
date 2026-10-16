"""QuizService — use case генерации, редактирования и прохождения квизов."""

from __future__ import annotations

import logging
import unicodedata
from dataclasses import replace
from uuid import UUID

from app.core.errors import Conflict, LLMBadResponse, NotFound
from app.domain.chat.types import Message
from app.domain.quiz.generation import build_generation_prompt, parse_generation
from app.domain.quiz.types import (
    AttemptResult,
    Choice,
    Difficulty,
    Quiz,
    QuizItem,
    QuizStatus,
)
from app.domain.rag.chunk import Source
from app.domain.student.types import Student
from app.infrastructure.llm.base import LLMProvider
from app.infrastructure.repositories.chunks_repo import ChunksRepository
from app.infrastructure.repositories.quizzes_repo import (
    AttemptSummary,
    QuizzesRepository,
    StudentAttempt,
)

log = logging.getLogger("mathsite.quiz")

_RAG_LIMIT = 8
_RAG_MIN_SIM = 0.4
_SYSTEM_PROMPT = (
    "Ты — учитель математики 8 класса. Твоя задача — составлять строгие тесты из текста учебника. "
    "Отвечай строго валидным JSON по приведённой схеме. Никаких комментариев."
)


class QuizService:
    def __init__(
        self,
        llm: LLMProvider,
        quizzes: QuizzesRepository,
        chunks: ChunksRepository,
    ):
        self._llm = llm
        self._quizzes = quizzes
        self._chunks = chunks

    # ---------- Генерация ----------

    async def generate(
        self,
        *,
        title: str,
        topic: str,
        source_key: Source | None,
        difficulty: Difficulty,
        items_count: int,
        created_by: UUID,
    ) -> Quiz:
        """Сгенерировать черновик квиза: RAG → LLM → валидация → draft в БД."""
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
                f"Выберите другой источник или смените формулировку темы."
            )

        fragments = [h.text for h in hits]
        user_prompt = build_generation_prompt(
            topic=topic,
            difficulty=difficulty,
            items_count=items_count,
            source_fragments=fragments,
        )
        reply = await self._llm.chat(
            messages=[
                Message(role="system", text=_SYSTEM_PROMPT),
                Message(role="user", text=user_prompt),
            ],
            temperature=0.3,
            max_tokens=4000,
        )

        items = parse_generation(reply.text)
        if len(items) == 0:
            raise LLMBadResponse("модель вернула пустой список вопросов")

        draft = Quiz(
            id=None,
            title=title.strip() or topic.strip(),
            topic=topic.strip(),
            source_key=source_key,
            difficulty=difficulty,
            status="draft",
            items=items,
        )
        saved = await self._quizzes.create(draft, created_by)
        log.info(
            "quiz generated · id=%s · topic=%s · items=%d",
            saved.id, topic, len(items),
        )
        return saved

    # ---------- Ручное создание ----------

    async def create(
        self,
        *,
        title: str,
        topic: str,
        difficulty: Difficulty,
        items: list[QuizItem],
        created_by: UUID,
    ) -> Quiz:
        """Квиз, собранный учителем руками. Создаётся черновиком, как и сгенерированный."""
        _validate_items(items)
        draft = Quiz(
            id=None,
            title=title.strip(),
            topic=topic.strip(),
            source_key=None,
            difficulty=difficulty,
            status="draft",
            items=[replace(it, position=i + 1) for i, it in enumerate(items)],
        )
        saved = await self._quizzes.create(draft, created_by)
        log.info("quiz created by hand · id=%s · items=%d", saved.id, len(items))
        return saved

    # ---------- CRUD ----------

    async def list(self, status: QuizStatus | None = None) -> list[Quiz]:
        return await self._quizzes.list(status)

    async def items_counts(self) -> dict[UUID, int]:
        """Число вопросов по квизам: в списках сами вопросы не читаем."""
        return await self._quizzes.items_counts()

    async def get(self, quiz_id: UUID) -> Quiz:
        quiz = await self._quizzes.get(quiz_id)
        if not quiz:
            raise NotFound(f"quiz {quiz_id} не найден")
        return quiz

    async def update_meta(
        self,
        quiz_id: UUID,
        *,
        title: str | None = None,
        topic: str | None = None,
    ) -> Quiz:
        await self._quizzes.update_meta(quiz_id, title=title, topic=topic)
        return await self.get(quiz_id)

    async def update_item(
        self,
        quiz_id: UUID,
        item_id: UUID,
        *,
        question_md: str | None = None,
        choices: list[Choice] | None = None,
        correct_answer: str | None = None,
        explanation: str | None = None,
    ) -> Quiz:
        if choices is not None and correct_answer is not None:
            ids = {c.id for c in choices}
            if correct_answer not in ids:
                raise Conflict("correct_answer должен быть одним из id вариантов")
        await self._quizzes.update_item(
            item_id,
            question_md=question_md,
            choices=choices,
            correct_answer=correct_answer,
            explanation=explanation,
        )
        return await self.get(quiz_id)

    async def replace_items(self, quiz_id: UUID, items: list[QuizItem]) -> Quiz:
        _validate_items(items)
        normalized = [replace(it, position=i + 1) for i, it in enumerate(items)]
        await self._quizzes.replace_items(quiz_id, normalized)
        return await self.get(quiz_id)

    async def publish(self, quiz_id: UUID) -> Quiz:
        quiz = await self.get(quiz_id)
        if not quiz.items:
            raise Conflict("нельзя опубликовать квиз без вопросов")
        await self._quizzes.update_meta(quiz_id, status="published")
        return await self.get(quiz_id)

    async def unpublish(self, quiz_id: UUID) -> Quiz:
        await self._quizzes.update_meta(quiz_id, status="draft")
        return await self.get(quiz_id)

    async def delete(self, quiz_id: UUID) -> None:
        await self._quizzes.delete(quiz_id)

    # ---------- Прохождение ----------

    async def attempt(
        self,
        quiz_id: UUID,
        *,
        student_name: str,
        student: Student | None,
        answers: dict[str, str],
    ) -> tuple[AttemptResult, UUID]:
        """Если `student` передан (есть cookie) — попытка привязывается к нему, иначе анон."""
        quiz = await self.get(quiz_id)
        if quiz.status != "published":
            raise Conflict("квиз не опубликован")

        per_item: list[dict] = []
        score = 0
        for item in quiz.items:
            iid = str(item.id)
            got = _normalize(answers.get(iid, ""))
            expected = _normalize(item.correct_answer)
            ok = bool(got) and got == expected
            if ok:
                score += 1
            per_item.append(
                {"item_id": iid, "correct": ok, "expected": item.correct_answer, "got": answers.get(iid, "")}
            )

        # авторизованный ученик — всегда под своим именем
        effective_name = student.name if student else (student_name.strip() or "аноним")

        attempt_id = await self._quizzes.save_attempt(
            quiz_id,
            effective_name,
            student.id if student else None,
            answers,
            score,
            len(quiz.items),
        )
        return AttemptResult(score=score, total=len(quiz.items), per_item=per_item), attempt_id

    async def list_attempts(self, quiz_id: UUID) -> list[AttemptSummary]:
        return await self._quizzes.list_attempts(quiz_id)

    async def list_attempts_by_student(self, student_id: UUID) -> list[StudentAttempt]:
        return await self._quizzes.list_by_student(student_id)


def _validate_items(items: list[QuizItem]) -> None:
    """Проверки, одинаковые для ручного создания и для замены списка вопросов."""
    for i, it in enumerate(items, start=1):
        if not it.question_md.strip():
            raise Conflict(f"вопрос {i}: пустая формулировка")
        if it.kind == "mcq":
            if len(it.choices) < 2:
                raise Conflict(f"вопрос {i}: нужно минимум два варианта ответа")
            ids = [c.id for c in it.choices]
            if len(set(ids)) != len(ids):
                raise Conflict(f"вопрос {i}: у вариантов повторяются id")
            if any(not c.text.strip() for c in it.choices):
                raise Conflict(f"вопрос {i}: пустой вариант ответа")
            if it.correct_answer not in ids:
                raise Conflict(f"вопрос {i}: не отмечен правильный вариант")
        elif not it.correct_answer.strip():
            raise Conflict(f"вопрос {i}: не задан правильный ответ")


def _normalize(s: str) -> str:
    return unicodedata.normalize("NFKC", s).strip().lower()
