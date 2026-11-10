"""Opaque public option IDs: their spelling must not reveal authored a/b/c order."""
import hashlib
import hmac
from uuid import UUID


def choice_token(secret: str, quiz_id: UUID, item_id: UUID, choice_id: str) -> str:
    message = f'quiz-choice:{quiz_id}:{item_id}:{choice_id}'.encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()[:32]
