"""Доменные типы учётки учителя (администратора)."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True)
class User:
    id: UUID
    email: str
    name: str
    role: str
    created_at: datetime
