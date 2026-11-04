"""Privacy, generated answer correctness, imports and test-environment guard."""
import json
import random
from unittest.mock import patch

import pytest
from app.core.errors import LLMBadResponse
from app.domain.quiz.generation import parse_generation
from app.domain.safety.pipeline import pre_filter, post_filter
from app.services.students_import_service import _parse_text
from tests.support import database_dsn, sample_pdf


def test_generated_choice_shuffling_preserves_correct_answer():
    raw = {'items': [{'question_md': 'Чему равно два плюс два?', 'choices': [{'id': 'a', 'text': 'Четыре'}, {'id': 'b', 'text': 'Пять'}, {'id': 'c', 'text': 'Шесть'}], 'correct_answer': 'a'}]}
    positions = set()
    for seed in range(12):
        item = parse_generation('```json\n' + json.dumps(raw) + '\n```', rng=random.Random(seed))[0]
        assert next(c for c in item.choices if c.id == item.correct_answer).text == 'Четыре'
        positions.add(item.correct_answer)
    assert len(positions) > 1
    raw['items'][0]['correct_answer'] = 'z'
    with pytest.raises(LLMBadResponse):
        parse_generation(json.dumps(raw))


def test_personal_contacts_are_removed_before_llm():
    result = pre_filter('Как решить x + 1 = 3? Моя почта pupil@example.test')
    assert result.allowed
    assert 'pupil@example.test' not in result.cleaned
    assert 'x + 1 = 3' in result.cleaned
    assert not pre_filter('   ').allowed
    assert not post_filter('  ').allowed


@pytest.mark.parametrize('separator', [',', ';', '|', '\t', '  '])
def test_class_import_retains_names_classes_and_line_numbers(separator):
    assert _parse_text(f'\n Иванов Иван{separator}8А\nПетров Пётр\n') == [(2, 'Иванов Иван', '8А'), (3, 'Петров Пётр', '')]


@pytest.mark.parametrize('dsn', ['', 'postgresql://localhost/postgres', 'postgresql://localhost/mathsite', 'postgresql://localhost/mathsite_test_prod/data'])
def test_reset_refuses_non_test_database(dsn):
    with patch.dict('os.environ', {'TEST_DATABASE_URL': dsn}):
        with pytest.raises(RuntimeError):
            database_dsn()


def test_pdf_fixture_contains_real_extractable_text():
    import io
    from pypdf import PdfReader
    text = PdfReader(io.BytesIO(sample_pdf())).pages[0].extract_text()
    assert 'x + 1 = 3' in text
    assert len(text.split()) >= 25
