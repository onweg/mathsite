"""Real PDF/index lifecycle, including historical zero-context materials."""
import io
import unittest
from unittest.mock import AsyncMock, patch
from uuid import UUID

import httpx
from pypdf import PdfWriter

from app.api.app_factory import create_app
from app.core.errors import LLMUnavailable
from app.infrastructure.repositories.materials_repo import PgMaterialsRepository
from tests.fake_llm import FakeLLM
from tests.support import EMAIL, PASSWORD, reset_database, sample_pdf


class MaterialContextTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        reset_database()
        self.app = create_app()
        lifespan = self.app.router.lifespan_context(self.app)
        await lifespan.__aenter__()
        self.addAsyncCleanup(lifespan.__aexit__, None, None, None)
        await self.app.state.pool.wait(timeout=15)
        self.llm = FakeLLM()
        self.app.state.llm = self.llm
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test')
        self.addAsyncCleanup(self.client.aclose)
        auth = await self.client.post('/auth/login', json={'email': EMAIL, 'password': PASSWORD})
        self.client.headers['Authorization'] = 'Bearer ' + auth.json()['access_token']

    async def upload(self, content):
        result = await self.client.post('/admin/materials', data={'title': 'Учебник'},
                                        files={'file': ('test.pdf', content, 'application/pdf')})
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()['material']['id']

    async def get(self, mid):
        response = await self.client.get(f'/admin/materials/{mid}')
        self.assertEqual(response.status_code, 200)
        return response.json()

    async def rows(self, source):
        async with self.app.state.pool.connection() as conn:
            return await (await conn.execute('SELECT id, text FROM chunks WHERE source = %s ORDER BY id', (source,))).fetchall()

    async def test_empty_pdf_is_failed_and_hidden_with_recovery_instructions(self):
        writer, buffer = PdfWriter(), io.BytesIO()
        writer.add_blank_page(width=100, height=100)
        writer.write(buffer)
        mid = await self.upload(buffer.getvalue())
        material = await self.get(mid)
        self.assertEqual(material['status'], 'failed')
        self.assertEqual(material['chunks_count'], 0)
        self.assertIn('OCR', material['error_message'])
        self.assertEqual((await self.client.get('/materials')).json(), [])
        retry = await self.client.post(f'/admin/materials/{mid}/reindex')
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json()['status'], 'pending')
        self.assertEqual((await self.get(mid))['status'], 'failed')

    async def test_historical_ready_with_missing_chunks_is_detected_and_recoverable(self):
        mid = await self.upload(sample_pdf())
        original = await self.get(mid)
        async with self.app.state.pool.connection() as conn:
            await conn.execute('DELETE FROM chunks WHERE source = %s', (original['source_key'],))
            await conn.execute('UPDATE materials SET chunks_count = 999 WHERE id = %s', (mid,))
        bad = await self.get(mid)
        self.assertEqual(bad['chunks_count'], 0)
        self.assertEqual(bad['status'], 'failed')
        self.assertEqual((await self.client.get('/admin/materials')).json()[0]['status'], 'failed')
        self.assertEqual((await self.client.get('/materials')).json(), [])
        self.assertEqual((await self.client.post(f'/admin/materials/{mid}/reindex')).status_code, 200)
        recovered = await self.get(mid)
        self.assertEqual(recovered['status'], 'ready')
        self.assertGreater(recovered['chunks_count'], 0)
        self.assertEqual(len((await self.client.get('/materials')).json()), 1)
        # Ready materials can actually be reprocessed, without duplicate chunks.
        await self.client.post(f'/admin/materials/{mid}/reindex')
        self.assertEqual((await self.get(mid))['chunks_count'], recovered['chunks_count'])

    async def test_embedding_failure_does_not_publish_partial_data_or_erase_old_context(self):
        mid = await self.upload(sample_pdf())
        original = await self.get(mid)
        old_rows = await self.rows(original['source_key'])
        words = 'Учебный материал о квадратных корнях и дробях. ' * 10
        with patch('app.services.indexing_service.extract_pages', return_value=[(1, words), (2, words)]), \
             patch.object(self.llm, 'embed', AsyncMock(side_effect=[[1.0] + [0.0] * 255, LLMUnavailable('test', 'offline')])):
            await self.client.post(f'/admin/materials/{mid}/reindex')
        failed = await self.get(mid)
        self.assertEqual(failed['status'], 'failed')
        self.assertIn('Повторите обработку', failed['error_message'])
        self.assertEqual(await self.rows(original['source_key']), old_rows)
        self.assertEqual(failed['chunks_count'], original['chunks_count'])
        await self.client.post(f'/admin/materials/{mid}/reindex')
        self.assertEqual((await self.get(mid))['status'], 'ready')

    async def test_reindex_is_admin_only_and_duplicate_jobs_are_rejected(self):
        mid = await self.upload(sample_pdf())
        response = await self.client.post(f'/admin/materials/{mid}/reindex', headers={'Authorization': ''})
        self.assertEqual(response.status_code, 401)
        repo = PgMaterialsRepository(self.app.state.pool)
        self.assertTrue(await repo.queue_reindex(UUID(mid)))
        self.assertFalse(await repo.queue_reindex(UUID(mid)))
        self.assertEqual((await self.client.post(f'/admin/materials/{mid}/reindex')).status_code, 409)
        self.assertEqual((await self.client.delete(f'/admin/materials/{mid}')).status_code, 409)
        self.assertTrue(await repo.claim_indexing(UUID(mid)))
        self.assertFalse(await repo.claim_indexing(UUID(mid)))
