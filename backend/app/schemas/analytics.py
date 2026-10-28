from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


# Only section identifiers, never URLs containing QR tokens or query strings.
AnalyticsPage = Literal[
    'home', 'ai', 'missed', 'weekly', 'quizzes', 'library',
    'around', 'olympiad', 'oge', 'ege', 'feedback', 'profile',
]


class ActivityPulse(BaseModel):
    id: UUID
    visit_id: UUID
    page: AnalyticsPage
    active_seconds: int = Field(ge=0, le=86400)
