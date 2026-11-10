from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.domain.battles import ReviewInput, RoundInput, average, rounded


@pytest.mark.parametrize('value', [-1, 5, 1.5, '4', True])
def test_review_strict_points(value):
    with pytest.raises(ValidationError):
        ReviewInput(reasoning=value, calculations=4, context=2, feedback='Пояснение оценки')


def test_average_uses_assigned_roles_and_waits_for_every_review():
    high = dict(reasoning=4, calculations=4, context=2)
    low = dict(reasoning=0, calculations=0, context=0)
    assert average({'teacher': high}, ['teacher', 'ai']) is None
    assert average({'teacher': high, 'ai': low, 'author': high}, ['teacher', 'ai']) == Decimal(5)
    assert rounded(Decimal(10) / 3) == 3.33


def test_round_requires_valid_roles_and_ordered_timezone_aware_deadlines():
    now = datetime.now(timezone.utc)
    valid = dict(title='Новый раунд', description='Практические задачи', reviewers=['teacher'], task_deadline=now, solve_deadline=now + timedelta(days=1))
    RoundInput(**valid)
    for patch in [dict(reviewers=[]), dict(reviewers=['teacher', 'teacher']), dict(reviewers=['student']), dict(solve_deadline=now - timedelta(days=1)), dict(task_deadline=now.replace(tzinfo=None))]:
        with pytest.raises(ValidationError):
            RoundInput(**(valid | patch))
