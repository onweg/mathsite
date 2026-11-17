"""RAG regression: real pgvector/text search, only the LLM is replaced."""
import unittest

import httpx

from app.api.app_factory import create_app
from app.domain.rag.chunk import Chunk
from app.infrastructure.repositories.chunks_repo import PgChunksRepository
from tests.fake_llm import FakeLLM
from tests.support import reset_database


QUERY_VECTOR = [1.0] + [0.0] * 255
LOW_SIMILARITY_VECTOR = [0.0, 1.0] + [0.0] * 254


class RagSearchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        reset_database()
        self.app = create_app()
        lifecycle = self.app.router.lifespan_context(self.app)
        await lifecycle.__aenter__()
        self.addAsyncCleanup(lifecycle.__aexit__, None, None, None)
        await self.app.state.pool.wait(timeout=15)
        self.llm = FakeLLM()
        self.app.state.llm = self.llm
        self.repo = PgChunksRepository(self.app.state.pool)
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app), base_url='http://test',
        )
        self.addAsyncCleanup(self.client.aclose)

    async def ask(self, query, source='material_roots'):
        response = await self.client.post('/rag/ask', json={
            'query': query, 'source_key': source, 'limit': 5,
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_book_heading_is_found_below_cosine_cutoff_and_sent_to_llm(self):
        text = 'Свойства арифметического квадрат- ного корня. Рассмотрим корень из дроби.'
        await self.repo.insert_many([
            (Chunk('material_roots', 88, text, 20), LOW_SIMILARITY_VECTOR),
            (Chunk('another_book', 7, 'PRIVATE-OTHER-BOOK ' + text, 20), QUERY_VECTOR),
        ])
        for query in ('АРИФМЕТИЧЕСКИЙ КВАДРАТНЫЙ КОРЕНЬ', 'арифметический корень',
                      'свойства квадратных корней'):
            with self.subTest(query=query):
                result = await self.ask(query)
                self.assertIsNone(result['reason'])
                self.assertEqual(len(result['chunks']), 1)
                self.assertEqual(result['chunks'][0]['page'], 88)
                self.assertEqual(result['chunks'][0]['similarity'], 0)
                prompt = self.llm.calls[-1][-1].text
                self.assertIn(text, prompt)
                self.assertNotIn('PRIVATE-OTHER-BOOK', prompt)

    async def test_semantic_search_still_finds_paraphrases_in_selected_book(self):
        # Enough closer vectors in other books to exhaust a default ANN scan.
        near = [0.9, 0.1] + [0.0] * 254
        await self.repo.insert_many([
            (Chunk('another_book', i, 'Чужой учебник', 3), QUERY_VECTOR)
            for i in range(100)
        ] + [(Chunk('material_roots', 12, 'Определение функции и её графика.', 7), near)])
        result = await self.ask('Зависимость переменных')
        self.assertEqual([c['page'] for c in result['chunks']], [12])
        self.assertEqual(result['chunks'][0]['source'], 'material_roots')

    async def test_lexical_hits_rank_first_without_duplicates_and_respect_limit(self):
        await self.repo.insert_many([
            (Chunk('material_roots', 10, 'Арифметический квадратный корень.', 4), QUERY_VECTOR),
            (Chunk('material_roots', 11, 'Арифметический квадратный корень.', 4), LOW_SIMILARITY_VECTOR),
            (Chunk('material_roots', 12, 'Теорема о треугольнике.', 4), QUERY_VECTOR),
        ])
        hits = await self.repo.hybrid_search(
            'арифметический квадратный корень', QUERY_VECTOR,
            source='material_roots', limit=2, min_similarity=0.5,
        )
        self.assertEqual([h.page for h in hits], [10, 11])
        self.assertEqual(len({h.id for h in hits}), 2)

    async def test_moderate_similarity_reaches_answer_but_weak_unmatched_text_does_not(self):
        moderate = [0.35, (1 - 0.35 ** 2) ** 0.5] + [0.0] * 254
        weak = [0.1, (1 - 0.1 ** 2) ** 0.5] + [0.0] * 254
        text = 'Определение функции и её графика.'
        await self.repo.insert_many([
            (Chunk('material_roots', 12, text, 7), moderate),
            (Chunk('material_roots', 99, 'Слабое совпадение: треугольники.', 5), weak),
            (Chunk('another_book', 1, 'Чужой источник.', 3), QUERY_VECTOR),
        ])
        result = await self.ask('Зависимость переменных')
        self.assertIsNone(result['reason'])
        self.assertEqual([c['page'] for c in result['chunks']], [12])
        self.assertAlmostEqual(result['chunks'][0]['similarity'], 0.35)
        prompt = self.llm.calls[-1][-1].text
        self.assertIn(text, prompt)
        self.assertNotIn('Слабое совпадение', prompt)
        self.assertNotIn('Чужой источник', prompt)

    async def test_no_match_or_empty_book_does_not_claim_topic_is_absent(self):
        await self.repo.insert_many([
            (Chunk('material_roots', 88, 'Квадратный корень из дроби.', 5), LOW_SIMILARITY_VECTOR),
        ])
        for source in ('material_roots', 'empty_book'):
            result = await self.ask('Площадь треугольника', source)
            self.assertEqual(result['reason'], 'no_relevant_chunks')
            self.assertEqual(result['chunks'], [])
            self.assertIn('не означает', result['text'])
        # Classifier calls only: no answer generation without evidence.
        self.assertEqual(len(self.llm.calls), 2)
