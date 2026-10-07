"""ChatService — use case обычного чата.

Pipeline:
    pre-filter (regex)
  → classifier (LLM)
  → system prompt + история + вопрос
  → LLM chat
  → post-filter (regex)
"""

import logging

from app.core.errors import SafetyBlocked
from app.domain.chat.types import ChatReply, Message, Topic
from app.domain.rag.prompts import system_prompt
from app.domain.safety import pipeline as safety
from app.infrastructure.llm.base import LLMProvider

from .classifier_service import ClassifierService

log = logging.getLogger("mathsite.chat")


class ChatService:
    def __init__(self, llm: LLMProvider, classifier: ClassifierService):
        self._llm = llm
        self._classifier = classifier

    async def ask(
        self,
        messages: list[Message],
        *,
        topic: Topic | None,
        section: str | None,
        temperature: float,
    ) -> ChatReply:
        last_user = next((m for m in reversed(messages) if m.role == "user"), None)
        if last_user is None:
            raise SafetyBlocked("no_user_message")

        pre = safety.pre_filter(last_user.text)
        if not pre.allowed:
            raise SafetyBlocked(f"pre_filter:{pre.reason}")
        cleaned = pre.cleaned

        if not await self._classifier.is_math_question(cleaned):
            raise SafetyBlocked("classifier:not_math")

        sys_text = system_prompt(topic)
        if section:
            sys_text += f"\n\nКонтекст страницы: {section}"

        history = list(messages)
        if history and history[-1].role == "user":
            history = history[:-1]

        prepared: list[Message] = [Message(role="system", text=sys_text)]
        prepared.extend(m for m in history if m.role in ("user", "assistant"))
        prepared.append(Message(role="user", text=cleaned))

        reply = await self._llm.chat(prepared, temperature=temperature)

        post = safety.post_filter(reply.text)
        if not post.allowed:
            raise SafetyBlocked(f"post_filter:{post.reason}")

        log.info(
            "chat ok · topic=%s · in=%d · out=%d",
            topic or "-", len(cleaned), len(reply.text),
        )
        return reply
