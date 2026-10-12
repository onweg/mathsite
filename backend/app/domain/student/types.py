"""Ученик (student). Отдельная сущность от User (учителя-админа).

Student не имеет пароля. Авторизация идёт по постоянному токену (qr_token),
который зашит в персональный QR-код ученика. Токен — 24 случайных байта,
base64url (длина 32 символа), генерируется через secrets.token_urlsafe.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True)
class Student:
    id: UUID
    name: str
    class_label: str
    qr_token: str
    note: str | None
    created_at: datetime


def new_qr_token() -> str:
    """Выделено в отдельную функцию, чтобы было одно место генерации токена."""
    import secrets

    return secrets.token_urlsafe(24)
