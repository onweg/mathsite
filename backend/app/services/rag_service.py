"""RagService — use case ответа строго по учебнику."""

import logging
from dataclasses import dataclass

from app.core.errors import SafetyBlocked
from app.domain.chat.types import ChatReply, Message, Topic
from app.domain.rag.chunk import SearchHit, Source
from app.domain.rag.prompt import build_rag_prompt
from app.domain.rag.prompts import system_prompt
from app.domain.safety import pipeline as safety
from app.infrastructure.llm.base import LLMProvider
from app.infrastructure.repositories.chunks_repo import ChunksRepository

from .classifier_service import ClassifierService

log = logging.getLogger("mathsite.rag")

_MIN_SIMILARITY = 0.5


@dataclass(frozen=True)
class RagAnswer:
    reply: ChatReply
    hits: list[SearchHit]
    not_found: bool = False


class RagService:
    def __init__(
        self,
        llm: LLMProvider,
        repo: ChunksRepository,
        classifier: ClassifierService,
    ):
        self._llm = llm
        self._repo = repo
        self._classifier = classifier

    async def ask(
        self,
        query: str,
        *,
        topic: Topic | None,
        limit: int,
    ) -> RagAnswer:
        pre = safety.pre_filter(query)
        if not pre.allowed:
            raise SafetyBlocked(f"pre_filter:{pre.reason}")
        query = pre.cleaned

        if not await self._classifier.is_math_question(query):
            raise SafetyBlocked("classifier:not_math")

        source: Source | None = None
        if topic == "algebra":
            source = "textbook_8_algebra"
        elif topic == "geometry":
            source = "textbook_8_geometry"

        q_vec = await self._llm.embed(query, kind="query")
        hits = await self._repo.semantic_search(
            q_vec,
            source=source,
            limit=limit,
            min_similarity=_MIN_SIMILARITY,
        )
        if not hits:
            return RagAnswer(
                reply=ChatReply(text=(
                    "В учебнике 8 класса я не нашёл ответа на этот вопрос. "
                    "Спроси у учителя."
                )),
                hits=[],
                not_found=True,
            )

        prompt = build_rag_prompt(query, hits)
        messages = [
            Message(role="system", text=system_prompt(topic)),
            Message(role="user", text=prompt),
        ]
        reply = await self._llm.chat(messages, temperature=0.2)

        post = safety.post_filter(reply.text)
        if not post.allowed:
            raise SafetyBlocked(f"post_filter:{post.reason}")

        log.info(
            "rag ok · topic=%s · chunks=%d · best=%.3f",
            topic or "-", len(hits), hits[0].similarity,
        )
        return RagAnswer(reply=reply, hits=hits)
