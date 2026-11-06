from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.domain.quiz.access import can_access_quiz
from app.domain.quiz.types import Quiz
from app.domain.student.types import Student
from app.schemas.quiz import CreateQuizRequest, GenerateRequest


@pytest.mark.parametrize('grade', ['8А', '9А', '11А'])
def test_retired_exam_quizzes_are_hidden_for_every_grade(grade):
    quiz = Quiz(id=uuid4(), title='Тест', topic='Тема', source_key=None, difficulty='easy', status='published')
    student = Student(id=uuid4(), name='Ученик', class_label=grade, qr_token='test-token', note=None, created_at=datetime.now(timezone.utc))
    for identity in (student, None):
        assert can_access_quiz(quiz, identity)
        for track in ('oge', 'ege'):
            assert not can_access_quiz(replace(quiz, track=track), identity)


@pytest.mark.parametrize('schema', [CreateQuizRequest, GenerateRequest])
def test_only_general_quizzes_can_be_created(schema):
    assert schema(title='Тест', topic='Алгебра').track == 'general'
    for track in ('oge', 'ege'):
        with pytest.raises(ValidationError):
            schema(title='Тест', topic='Алгебра', track=track)
