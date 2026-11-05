from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.domain.quiz.access import can_access_quiz, preparation_track
from app.domain.quiz.generation import build_generation_prompt, build_refine_prompt
from app.domain.quiz.types import Quiz
from app.domain.student.types import Student


@pytest.mark.parametrize('label,track', [
    ('9', 'oge'), ('9А', 'oge'), (' 9 «Б» ', 'oge'), ('9 класс', 'oge'),
    ('11Б', 'ege'), ('11 класс А', 'ege'), ('11-й класс', 'ege'),
    ('8А', None), ('', None), ('19А', None), ('109', None), ('9/11', None),
    ('9 группа', None), ('11.5', None),
])
def test_preparation_uses_unambiguous_grade(label, track):
    assert preparation_track(label) == track


def test_access_requires_student_identity_and_matching_grade():
    quiz = Quiz(id=uuid4(), title='Тест', topic='Тема', source_key=None, difficulty='easy', status='published')
    student = Student(id=uuid4(), name='Ученик', class_label='9А', qr_token='test-token', note=None, created_at=datetime.now(timezone.utc))
    assert can_access_quiz(quiz, None)
    assert can_access_quiz(quiz, student)
    assert can_access_quiz(replace(quiz, track='oge'), student)
    assert not can_access_quiz(replace(quiz, track='ege'), student)
    assert not can_access_quiz(replace(quiz, track='oge'), None)


@pytest.mark.parametrize('track,grade,exam', [('oge', 9, 'ОГЭ'), ('ege', 11, 'ЕГЭ')])
def test_generation_and_refinement_use_the_exam_grade(track, grade, exam):
    for prompt in (
        build_generation_prompt(topic='Уравнения', difficulty='medium', items_count=5, source_fragments=[], track=track),
        build_refine_prompt(topic='Уравнения', difficulty='medium', items=[], instruction='Упростить', source_fragments=[], track=track),
    ):
        assert f'{grade} класса' in prompt
        assert exam in prompt
        assert '8 класса' not in prompt
