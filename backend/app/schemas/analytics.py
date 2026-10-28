from typing import Literal
from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class AnalyticsInsightsRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    start: date | None = None
    end: date | None = None
