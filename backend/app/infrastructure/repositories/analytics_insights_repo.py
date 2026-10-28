"""Aggregate-only source for teacher insights; never selects student identities/text."""
from datetime import datetime
from typing import Protocol

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


class AnalyticsInsightsRepository(Protocol):
    async def snapshot(self, since: datetime, until: datetime) -> dict: ...


class PgAnalyticsInsightsRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def snapshot(self, since: datetime, until: datetime) -> dict:
        params = {'since': since, 'until': until}
        queries = {
            'site': '''SELECT
                (SELECT COUNT(DISTINCT visit_id) FROM site_activity WHERE created_at >= %(since)s AND created_at < %(until)s) AS visits,
                (SELECT COUNT(DISTINCT student_id) FROM site_activity WHERE created_at >= %(since)s AND created_at < %(until)s) AS visitors,
                (SELECT COALESCE(SUM(active_seconds), 0) FROM site_activity WHERE created_at >= %(since)s AND created_at < %(until)s) AS active_seconds,
                (SELECT COUNT(*) FROM quiz_attempts WHERE created_at >= %(since)s AND created_at < %(until)s) AS quiz_attempts,
                (SELECT COUNT(*) FROM library_events WHERE created_at >= %(since)s AND created_at < %(until)s) AS library_events,
                (SELECT COUNT(*) FROM weekly_submissions WHERE created_at >= %(since)s AND created_at < %(until)s) AS weekly_submissions,
                (SELECT COUNT(*) FROM poll_answers WHERE created_at >= %(since)s AND created_at < %(until)s) AS poll_answers
            ''',
            'quizzes': '''WITH ranked AS (
                SELECT quiz_id, student_id, score, total, created_at,
                    ROW_NUMBER() OVER (PARTITION BY quiz_id, student_id ORDER BY created_at, id) AS attempt_number
                FROM quiz_attempts
            ), stats AS (
                SELECT quiz_id, COUNT(*) AS attempts, COUNT(DISTINCT student_id) AS learners,
                    COUNT(*) FILTER (WHERE student_id IS NULL) AS anonymous_attempts,
                    AVG(100.0 * score / GREATEST(total, 1)) AS average_score,
                    COUNT(*) FILTER (WHERE student_id IS NOT NULL AND attempt_number = 1) AS first_attempts,
                    AVG(100.0 * score / GREATEST(total, 1)) FILTER
                        (WHERE student_id IS NOT NULL AND attempt_number = 1) AS first_average_score,
                    COUNT(*) FILTER (WHERE student_id IS NOT NULL AND attempt_number > 1) AS repeat_attempts,
                    COUNT(*) FILTER (WHERE student_id IS NOT NULL AND attempt_number = 1
                        AND 100.0 * score / GREATEST(total, 1) >= 80) AS first_high_scores,
                    COUNT(*) FILTER (WHERE student_id IS NOT NULL AND attempt_number = 1
                        AND 100.0 * score / GREATEST(total, 1) < 50) AS first_low_scores
                FROM ranked WHERE created_at >= %(since)s AND created_at < %(until)s GROUP BY quiz_id
            ) SELECT q.id, q.title, (q.status = 'published') AS published,
                COALESCE(s.attempts, 0) AS attempts, COALESCE(s.learners, 0) AS learners,
                COALESCE(s.anonymous_attempts, 0) AS anonymous_attempts, s.average_score,
                COALESCE(s.first_attempts, 0) AS first_attempts, s.first_average_score,
                COALESCE(s.repeat_attempts, 0) AS repeat_attempts,
                COALESCE(s.first_high_scores, 0) AS first_high_scores,
                COALESCE(s.first_low_scores, 0) AS first_low_scores
            FROM quizzes q LEFT JOIN stats s ON s.quiz_id = q.id
            WHERE q.created_at < %(until)s AND (q.status = 'published' OR s.attempts > 0)
            ORDER BY attempts DESC, q.id
            ''',
            'materials': '''WITH stats AS (
                SELECT item_id, COUNT(*) AS views, COUNT(DISTINCT student_id) AS readers,
                    COUNT(*) FILTER (WHERE action = 'open') AS article_opens,
                    COUNT(*) FILTER (WHERE action = 'file') AS file_opens,
                    COUNT(*) FILTER (WHERE action = 'link') AS link_clicks
                FROM library_events WHERE created_at >= %(since)s AND created_at < %(until)s
                GROUP BY item_id
            ) SELECT i.id, i.title, i.collection, i.kind, i.is_published AS published,
                COALESCE(s.views, 0) AS views, COALESCE(s.readers, 0) AS readers,
                COALESCE(s.article_opens, 0) AS article_opens,
                COALESCE(s.file_opens, 0) AS file_opens, COALESCE(s.link_clicks, 0) AS link_clicks
            FROM library_items i LEFT JOIN stats s ON s.item_id = i.id
            WHERE i.created_at < %(until)s AND (i.is_published OR s.views > 0)
            ORDER BY views DESC, i.id
            ''',
            'sections': '''SELECT page, COUNT(*) AS opens, COUNT(DISTINCT visit_id) AS visits,
                COUNT(DISTINCT student_id) AS visitors, SUM(active_seconds) AS active_seconds
                FROM site_activity WHERE created_at >= %(since)s AND created_at < %(until)s
                GROUP BY page ORDER BY active_seconds DESC, page
            ''',
            'weekly': '''WITH stats AS (
                SELECT task_id, COUNT(*) AS submissions,
                    COUNT(*) FILTER (WHERE status = 'new') AS pending,
                    COUNT(*) FILTER (WHERE status = 'correct') AS correct,
                    COUNT(*) FILTER (WHERE status = 'partial') AS partial,
                    COUNT(*) FILTER (WHERE status = 'wrong') AS wrong
                FROM weekly_submissions WHERE created_at >= %(since)s AND created_at < %(until)s
                GROUP BY task_id
            ) SELECT t.id, t.title, t.is_published AS published,
                COALESCE(s.submissions, 0) AS submissions, COALESCE(s.pending, 0) AS pending,
                COALESCE(s.correct, 0) AS correct, COALESCE(s.partial, 0) AS partial,
                COALESCE(s.wrong, 0) AS wrong
            FROM weekly_tasks t LEFT JOIN stats s ON s.task_id = t.id
            WHERE t.created_at < %(until)s AND (t.is_published OR s.submissions > 0)
            ORDER BY submissions DESC, t.id
            ''',
            'polls': '''SELECT p.id, p.title, p.is_published AS published,
                COUNT(a.id) AS answers
                FROM polls p LEFT JOIN poll_answers a ON a.poll_id = p.id
                    AND a.created_at >= %(since)s AND a.created_at < %(until)s
                WHERE p.created_at < %(until)s
                GROUP BY p.id HAVING p.is_published OR COUNT(a.id) > 0
                ORDER BY answers DESC, p.id
            ''',
        }
        result = {}
        async with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            await cur.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            for key, sql in queries.items():
                await cur.execute(sql, params)
                rows = await cur.fetchall()
                result[key] = rows[0] if key == 'site' else rows
        return result
