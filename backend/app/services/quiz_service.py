"""QuizService — use case генерации, редактирования и прохождения квизов."""

from __future__ import annotations

import logging
import unicodedata
from dataclasses import replace
from uuid import UUID

from app.core.errors import Conflict, LLMBadResponse, NoSourceMaterial, NotFound, NotAuthenticated
from app.domain.chat.types import Message
from app.domain.quiz.generation import (
    build_generation_prompt,
    build_refine_prompt,
    parse_generation,
)
from app.domain.quiz.access import can_access_quiz
from app.domain.quiz.types import (
    QuizTrack,
    AttemptResult,
    Choice,
    Difficulty,
    Quiz,
    QuizItem,
    QuizStatus,
)
from app.domain.rag.chunk import SearchHit, Source
from app.domain.student.types import Student
from app.infrastructure.llm.base import LLMProvider
from app.infrastructure.repositories.chunks_repo import ChunksRepository
from app.infrastructure.repositories.quizzes_repo import (
    AttemptSummary,
    QuizzesRepository,
    StudentAttempt,
    StudentAttemptSummary,
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

    async def find_source(
        self, *, topic: str, source_key: Source | None
    ) -> list[SearchHit]:
        """Фрагменты учебника по теме. Отдельный метод — им же смотрит превью."""
        q_vec = await self._llm.embed(topic, kind="query")
        return await self._chunks.semantic_search(
            q_vec,
            source=source_key,
            limit=_RAG_LIMIT,
            min_similarity=_RAG_MIN_SIM,
        )

    async def _ask_model(self, user_prompt: str, track: QuizTrack = "general") -> list[QuizItem]:
        """Спросить модель с повтором, называя ей причину отказа.

        Модель ломает JSON на LaTeX'е, переписывает в условие кашу из PDF и
        ставит «верно» ответом на каждое утверждение. Всё это ловит
        parse_generation. Просто переспросить мало: без объяснения модель
        повторяет ту же ошибку, поэтому в следующую попытку кладём текст
        претензии и просим исправить именно её. Попытки холоднее предыдущей.
        """
        system_prompt = _SYSTEM_PROMPT
        if track != "general":
            audience = "9 класса, подготовка к ОГЭ" if track == "oge" else "11 класса, подготовка к ЕГЭ"
            system_prompt = _SYSTEM_PROMPT.replace("8 класса", audience)
        last_error: LLMBadResponse | None = None
        for attempt, temperature in enumerate((0.3, 0.15, 0.1), start=1):
            reply = await self._llm.chat(
                messages=[
                    Message(role="system", text=system_prompt),
                    Message(role="user", text=_with_retry_note(user_prompt, last_error)),
                ],
                temperature=temperature,
                max_tokens=4000,
            )
            try:
                items = parse_generation(reply.text)
            except LLMBadResponse as e:
                last_error = e
                log.warning("quiz generation attempt %d failed: %s", attempt, e)
                continue
            if items:
                return items
            last_error = LLMBadResponse("модель вернула пустой список вопросов")
        raise last_error or LLMBadResponse("модель не вернула вопросы")

    async def generate(
        self,
        *,
        title: str,
        topic: str,
        source_key: Source | None,
        difficulty: Difficulty,
        items_count: int,
        created_by: UUID,
        track: QuizTrack = "general",
        allow_without_source: bool = False,
        use_materials: bool = True,
        hint: str | None = None,
    ) -> Quiz:
        """Черновик квиза: RAG → LLM → валидация → draft в БД.

        use_materials=False — учитель сознательно просит вопросы без учебника,
        тогда в поиск не ходим вовсе. Если же искали и не нашли, поднимаем
        NoSourceMaterial: фронт по этому коду предлагает повторить с
        allow_without_source.
        """
        hits = (
            await self.find_source(topic=topic, source_key=source_key)
            if use_materials
            else []
        )
        if use_materials and not hits and not allow_without_source:
            raise NoSourceMaterial(
                f"По теме «{topic}» не нашлось материала в выбранном источнике."
            )

        items = await self._ask_model(
            build_generation_prompt(
                topic=topic,
                difficulty=difficulty,
                items_count=items_count,
                source_fragments=[h.text for h in hits],
                hint=hint,
                track=track,
            ),
            track=track,
        )

        draft = Quiz(
            id=None,
            title=title.strip() or topic.strip(),
            topic=topic.strip(),
            source_key=source_key if hits else None,
            difficulty=difficulty,
            status="draft",
            track=track,
            items=items,
        )
        saved = await self._quizzes.create(draft, created_by)
        log.info(
            "quiz generated · id=%s · topic=%s · items=%d · chunks=%d · hint=%s",
            saved.id, topic, len(items), len(hits), bool(hint),
        )
        return saved

    # ---------- Доработка черновика ----------

    async def refine(self, quiz_id: UUID, *, instruction: str) -> Quiz:
        """Переработать черновик по замечанию учителя.

        Только черновик: замена вопросов пересоздаёт их id, и у опубликованного
        квиза это разорвало бы связь со сданными попытками.
        """
        quiz = await self.get(quiz_id)
        if quiz.status != "draft":
            raise Conflict(
                "дорабатывать можно только черновик — снимите тест с публикации"
            )
        if not quiz.items:
            raise Conflict("в тесте нет вопросов: нечего дорабатывать")

        hits = await self.find_source(topic=quiz.topic, source_key=quiz.source_key)
        items = await self._ask_model(
            build_refine_prompt(
                topic=quiz.topic,
                difficulty=quiz.difficulty,
                items=quiz.items,
                instruction=instruction,
                source_fragments=[h.text for h in hits],
                track=quiz.track,
            ),
            track=quiz.track,
        )
        _validate_items(items)
        await self._quizzes.replace_items(
            quiz_id, [replace(it, position=i + 1) for i, it in enumerate(items)]
        )
        log.info(
            "quiz refined · id=%s · items=%d→%d · instruction=%s",
            quiz_id, len(quiz.items), len(items), instruction[:120],
        )
        return await self.get(quiz_id)

    # ---------- Ручное создание ----------

    async def create(
        self,
        *,
        title: str,
        topic: str,
        difficulty: Difficulty,
        items: list[QuizItem],
        created_by: UUID,
        track: QuizTrack = "general",
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
            track=track,
            items=[replace(it, position=i + 1) for i, it in enumerate(items)],
        )
        saved = await self._quizzes.create(draft, created_by)
        log.info("quiz created by hand · id=%s · items=%d", saved.id, len(items))
        return saved

    # ---------- CRUD ----------

    async def list(self, status: QuizStatus | None = None) -> list[Quiz]:
        return await self._quizzes.list(status)

    async def list_published_for(
        self, student: Student | None
    ) -> tuple[list[Quiz], set[UUID]]:
        """Все опубликованные квизы + id тех, что ученик уже проходил.

        Отдаём и то и другое: главная прячет пройденные, но должна отличать
        «ты всё прошёл» от «учитель ещё ничего не опубликовал».
        """
        quizzes = await self._quizzes.list(status="published")
        quizzes = [q for q in quizzes if can_access_quiz(q, student) and not q.is_completed]
        if not student:
            return quizzes, set()
        return quizzes, await self._quizzes.attempted_ids(student.id)

    async def items_counts(self) -> dict[UUID, int]:
        """Число вопросов по квизам: в списках сами вопросы не читаем."""
        return await self._quizzes.items_counts()

    async def get(self, quiz_id: UUID) -> Quiz:
        quiz = await self._quizzes.get(quiz_id)
        if not quiz:
            raise NotFound(f"quiz {quiz_id} не найден")
        return quiz

    async def get_published_for(self, quiz_id: UUID, student: Student | None) -> Quiz:
        if student is None:
            raise NotAuthenticated("для прохождения теста войди по своему QR-коду")
        quiz = await self.get(quiz_id)
        if not can_access_quiz(quiz, student) or quiz.status != "published":
            raise NotFound("тест не найден")
        if quiz.is_completed:
            raise Conflict("тест завершён; приём ответов закрыт")
        if quiz_id in await self._quizzes.attempted_ids(student.id):
            raise Conflict("ты уже прошёл этот тест; доступна только одна попытка")
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
        if quiz.track != "general":
            raise Conflict("тренировочные тесты ОГЭ и ЕГЭ больше не доступны")
        if not quiz.items:
            raise Conflict("нельзя опубликовать тест без вопросов")
        await self._quizzes.update_meta(quiz_id, status="published")
        return await self.get(quiz_id)

    async def unpublish(self, quiz_id: UUID) -> Quiz:
        await self._quizzes.update_meta(quiz_id, status="draft")
        return await self.get(quiz_id)

    async def finish(self, quiz_id: UUID) -> Quiz:
        await self._quizzes.finish(quiz_id)
        return await self.get(quiz_id)

    async def review_attempt(self, attempt_id: UUID, student: Student) -> dict:
        record = await self._quizzes.review_attempt(attempt_id, student.id)
        legacy = record['items'] is None
        items = record['items']
        if legacy:
            quiz = await self.get(record['quiz_id'])
            items = _review_items(quiz, record['answers'], existing_only=True)
        return dict(attempt_id=str(attempt_id), quiz_title=record['quiz_title'],
                    score=record['score'], total=record['total'], legacy=legacy, items=items)

    async def delete(self, quiz_id: UUID) -> None:
        await self._quizzes.delete(quiz_id)

    # ---------- Прохождение ----------

    async def attempt(
        self,
        quiz: Quiz,
        *,
        student_name: str,
        student: Student | None,
        answers: dict[str, str],
    ) -> tuple[AttemptResult, UUID]:
        """Результат отдаём только после атомарного сохранения единственной попытки."""
        if student is None:
            raise NotAuthenticated("для прохождения теста войди по своему QR-коду")
        if not can_access_quiz(quiz, student):
            raise NotFound("тест не найден")
        if quiz.is_completed:
            raise Conflict("тест завершён; приём ответов закрыт")
        if quiz.status != "published":
            raise Conflict("тест не опубликован")
        if not quiz.items or set(answers) != {str(item.id) for item in quiz.items}:
            raise Conflict("нужно ответить на все вопросы текущей версии теста")
        for item in quiz.items:
            value = answers[str(item.id)]
            if not value.strip() or len(value) > 2000:
                raise Conflict("проверь заполнение ответов")
            if item.kind == "mcq" and value not in {c.id for c in item.choices}:
                raise Conflict("неизвестный вариант ответа")

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
                {"item_id": iid, "correct": ok, "got": next((c.text for c in item.choices if c.id == answers[iid]), answers[iid])}
            )

        # авторизованный ученик — всегда под своим именем
        effective_name = student.name

        attempt_id = await self._quizzes.save_attempt(
            quiz.id,
            effective_name,
            student.id,
            answers,
            score,
            len(quiz.items),
            quiz.updated_at,
            _review_items(quiz, answers),
        )
        return AttemptResult(score=score, total=len(quiz.items), per_item=per_item), attempt_id

    async def list_attempts(self, quiz_id: UUID) -> list[AttemptSummary]:
        return await self._quizzes.list_attempts(quiz_id)

    async def attempts_summary(self, quiz_id: UUID) -> list[StudentAttemptSummary]:
        await self.get(quiz_id)
        return await self._quizzes.attempts_summary(quiz_id)

    async def list_attempts_by_student(self, student_id: UUID) -> list[StudentAttempt]:
        return await self._quizzes.list_by_student(student_id)


def _with_retry_note(prompt: str, error: LLMBadResponse | None) -> str:
    """Дописать к промпту, чем не понравилась прошлая попытка."""
    if error is None:
        return prompt
    return (
        f"{prompt}\n\nПрошлый твой ответ отклонён проверкой: {error}.\n"
        "Собери тест заново по тем же требованиям и обязательно исправь это."
    )


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


def _review_items(quiz: Quiz, answers: dict[str, str], *, existing_only: bool = False) -> list[dict]:
    items = []
    for item in quiz.items:
        iid = str(item.id)
        if existing_only and iid not in answers:
            continue
        got = answers.get(iid, '')
        choices = {c.id: c.text for c in item.choices}
        items.append(dict(item_id=iid, position=item.position, question_md=item.question_md,
                          got=choices.get(got, got) if item.kind == 'mcq' else got,
                          expected=choices.get(item.correct_answer, item.correct_answer) if item.kind == 'mcq' else item.correct_answer,
                          correct=bool(_normalize(got)) and _normalize(got) == _normalize(item.correct_answer),
                          explanation=item.explanation))
    return items
