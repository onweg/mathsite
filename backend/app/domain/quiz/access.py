"""Exam practice is available only to an authenticated pupil's grade."""
import re
import unicodedata
from typing import Literal

from app.domain.quiz.types import Quiz
from app.domain.student.types import Student


def preparation_track(class_label: str) -> Literal['oge', 'ege'] | None:
    # Accept 9, 9А, 9 «Б», 9 класс / 11-й класс, but not 19, 9/11 or arbitrary groups.
    label = unicodedata.normalize('NFKC', class_label).strip().lower()
    match = re.fullmatch(r'(9|11)(?:\s*[-–]?\s*(?:-?й\s+)?класс)?(?:\s*[«"\']?[а-яёa-z][»"\']?)?', label)
    if not match:
        return None
    return 'oge' if match[1] == '9' else 'ege'


def can_access_quiz(quiz: Quiz, student: Student | None) -> bool:
    return quiz.track == 'general' or (
        student is not None and preparation_track(student.class_label) == quiz.track
    )
