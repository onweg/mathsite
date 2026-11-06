"""Only general quizzes are available; retired exam quizzes retain their history."""

from app.domain.quiz.types import Quiz
from app.domain.student.types import Student


def can_access_quiz(quiz: Quiz, student: Student | None) -> bool:
    return quiz.track == 'general'
