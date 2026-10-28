"""First-party engagement and read-only reports over existing learning records."""
from datetime import datetime
from typing import Protocol
from uuid import UUID

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


class AnalyticsRepository(Protocol):
    async def pulse(self, *, id: UUID, visit_id: UUID, student_id: UUID | None,
                    page: str, active_seconds: int) -> None: ...

    async def report(self, *, since: datetime, until: datetime,
                     class_label: str | None, student_id: UUID | None) -> dict: ...


class PgAnalyticsRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def pulse(self, *, id: UUID, visit_id: UUID, student_id: UUID | None,
                    page: str, active_seconds: int) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute('''
                INSERT INTO site_activity (id, visit_id, student_id, page, active_seconds)
                VALUES (%s, %s, %s, %s, LEAST(%s, 30))
                ON CONFLICT (id) DO UPDATE SET
                    active_seconds = GREATEST(site_activity.active_seconds,
                        LEAST(%s, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM
                            (NOW() - site_activity.created_at)))::integer))),
                    last_seen = NOW()
                WHERE site_activity.student_id IS NOT DISTINCT FROM EXCLUDED.student_id
                  AND site_activity.visit_id = EXCLUDED.visit_id
                  AND site_activity.page = EXCLUDED.page
            ''', (id, visit_id, student_id, page, active_seconds, active_seconds))

    async def report(self, *, since: datetime, until: datetime,
                     class_label: str | None, student_id: UUID | None) -> dict:
        params = dict(since=since, until=until, class_label=class_label, student_id=student_id)
        filters = ''
        roster_filters = ''
        if class_label is not None:
            filters += ' AND s.class_label = %(class_label)s'
            roster_filters += ' AND s.class_label = %(class_label)s'
        if student_id is not None:
            filters += ' AND a.student_id = %(student_id)s'
            roster_filters += ' AND s.id = %(student_id)s'

        # Each source is filtered BEFORE aggregation; joining raw attempts to raw
        # visits would multiply counts. All query fragments below are static.
        sources = []
        for alias, table, name in (
            ('v', 'site_activity', "COALESCE(s.name, '')"),
            ('q', 'quiz_attempts', 'COALESCE(s.name, a.student_name)'),
            ('w', 'weekly_submissions', 'COALESCE(s.name, a.student_name)'),
            ('l', 'library_events', 'COALESCE(s.name, a.student_name)'),
            ('p', 'poll_answers', 'COALESCE(s.name, a.student_name)'),
        ):
            sources.append(f'''{alias} AS (
                SELECT a.*, {name} AS name, COALESCE(s.class_label, '') AS student_class
                FROM {table} a LEFT JOIN students s ON s.id = a.student_id
                WHERE a.created_at >= %(since)s AND a.created_at < %(until)s {filters}
            )''')
        base = 'WITH ' + ',\n'.join(sources) + '\n'
        queries = {
            'totals': '''SELECT
                (SELECT COUNT(DISTINCT visit_id) FROM v) AS visits,
                (SELECT COUNT(DISTINCT visit_id) FROM v WHERE student_id IS NULL) AS anonymous_visits,
                (SELECT COUNT(DISTINCT student_id) FROM v) AS visitors,
                (SELECT COUNT(*) FROM v) AS page_views,
                (SELECT COALESCE(SUM(active_seconds), 0) FROM v) AS active_seconds,
                (SELECT COUNT(*) FROM q) AS quiz_attempts,
                (SELECT COALESCE(AVG(100.0 * score / GREATEST(total, 1)), 0) FROM q) AS average_score,
                (SELECT COUNT(*) FROM w) AS weekly_submissions,
                (SELECT COUNT(*) FROM w WHERE status = 'new') AS weekly_pending,
                (SELECT COUNT(*) FROM l) AS library_views,
                (SELECT COUNT(*) FROM p) AS poll_answers
            ''',
            'students': f''',
                sessions AS (SELECT student_id, visit_id, MIN(created_at) AS started_at,
                    MAX(last_seen) AS last_seen, SUM(active_seconds) AS active_seconds
                    FROM v GROUP BY student_id, visit_id),
                va AS (SELECT student_id, COUNT(*) AS visits,
                    SUM(active_seconds) AS active_seconds, MAX(last_seen) AS last_seen,
                    MAX(started_at) AS last_visit FROM sessions GROUP BY student_id),
                qa AS (SELECT student_id, COUNT(*) AS attempts,
                    AVG(100.0 * score / GREATEST(total, 1)) AS average_score,
                    MAX(created_at) AS last_quiz FROM q GROUP BY student_id),
                wa AS (SELECT student_id, COUNT(*) AS submissions,
                    COUNT(*) FILTER (WHERE status = 'correct') AS correct,
                    MAX(created_at) AS last_weekly FROM w GROUP BY student_id),
                la AS (SELECT student_id, COUNT(*) AS views, MAX(created_at) AS last_library
                    FROM l GROUP BY student_id),
                pa AS (SELECT student_id, COUNT(*) AS answers, MAX(created_at) AS last_poll
                    FROM p GROUP BY student_id)
                SELECT s.id, s.name, s.class_label, COALESCE(va.visits, 0) AS visits,
                    COALESCE(va.active_seconds, 0) AS active_seconds, va.last_seen, va.last_visit,
                    GREATEST(va.last_seen, qa.last_quiz, wa.last_weekly, la.last_library, pa.last_poll) AS last_activity,
                    COALESCE(qa.attempts, 0) AS quiz_attempts, qa.average_score,
                    COALESCE(wa.submissions, 0) AS weekly_submissions,
                    COALESCE(wa.correct, 0) AS weekly_correct,
                    COALESCE(la.views, 0) AS library_views, COALESCE(pa.answers, 0) AS poll_answers
                FROM students s
                LEFT JOIN va ON va.student_id = s.id LEFT JOIN qa ON qa.student_id = s.id
                LEFT JOIN wa ON wa.student_id = s.id LEFT JOIN la ON la.student_id = s.id
                LEFT JOIN pa ON pa.student_id = s.id
                WHERE TRUE {roster_filters}
                ORDER BY last_activity DESC NULLS LAST, s.class_label, s.name, s.id
            ''',
            'quizzes': '''SELECT a.quiz_id, t.title, a.student_id, MAX(a.name) AS student_name,
                    MAX(a.student_class) AS class_label, COUNT(*) AS attempts,
                    MAX(100.0 * a.score / GREATEST(a.total, 1)) AS best_score,
                    AVG(100.0 * a.score / GREATEST(a.total, 1)) AS average_score,
                    (ARRAY_AGG(a.score ORDER BY a.created_at DESC, a.id DESC))[1] AS last_score,
                    (ARRAY_AGG(a.total ORDER BY a.created_at DESC, a.id DESC))[1] AS last_total,
                    MAX(a.created_at) AS last_attempt
                FROM q a JOIN quizzes t ON t.id = a.quiz_id
                GROUP BY a.quiz_id, t.title, a.student_id, COALESCE(a.student_id, a.id)
                ORDER BY last_attempt DESC, t.title
            ''',
            'weekly': '''SELECT a.id, a.task_id, t.title, a.student_id, a.name AS student_name,
                    a.student_class AS class_label, a.status, a.teacher_comment,
                    a.solution_md, a.image_filename, a.created_at, a.reviewed_at
                FROM w a JOIN weekly_tasks t ON t.id = a.task_id
                ORDER BY (a.status = 'new') DESC, a.created_at DESC
            ''',
            'content': '''SELECT a.collection, a.item_id, COALESCE(i.title, 'Раздел') AS title,
                    a.action, COUNT(*) AS views, COUNT(DISTINCT a.student_id) AS students,
                    MAX(a.created_at) AS last_view
                FROM l a LEFT JOIN library_items i ON i.id = a.item_id
                GROUP BY a.collection, a.item_id, i.title, a.action
                ORDER BY views DESC, last_view DESC
            ''',
            'pages': '''SELECT page, COUNT(*) AS views, COUNT(DISTINCT visit_id) AS visits,
                    COUNT(DISTINCT student_id) AS students, SUM(active_seconds) AS active_seconds
                FROM v GROUP BY page ORDER BY active_seconds DESC, views DESC
            ''',
            'polls': '''SELECT a.id, a.poll_id, t.title, a.student_id, a.name AS student_name,
                    a.student_class AS class_label, a.comment, a.created_at,
                    COALESCE((SELECT STRING_AGG(o.text, ', ' ORDER BY o.position)
                              FROM poll_options o WHERE o.id = ANY(a.option_ids)), '') AS choices
                FROM p a JOIN polls t ON t.id = a.poll_id ORDER BY a.created_at DESC
            ''',
            'daily': ''', days AS (
                SELECT (created_at AT TIME ZONE 'Europe/Moscow')::date AS day,
                    COUNT(DISTINCT visit_id) AS visits, SUM(active_seconds) AS active_seconds,
                    0::bigint AS attempts FROM v GROUP BY day
                UNION ALL
                SELECT (created_at AT TIME ZONE 'Europe/Moscow')::date AS day,
                    0, 0, COUNT(*) FROM q GROUP BY day
            ) SELECT day, SUM(visits) AS visits, SUM(active_seconds) AS active_seconds,
                SUM(attempts) AS attempts FROM days GROUP BY day ORDER BY day
            ''',
        }
        report = {}
        async with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            # Consistent snapshot across tiles and tables while pupils submit work.
            await cur.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            for key, query in queries.items():
                await cur.execute(base + query, params)
                rows = await cur.fetchall()
                report[key] = rows[0] if key == 'totals' else rows
            await cur.execute('SELECT MIN(created_at) AS started_at FROM site_activity')
            report['tracking_since'] = (await cur.fetchone())['started_at']
            await cur.execute('SELECT DISTINCT class_label FROM students ORDER BY class_label')
            report['classes'] = [r['class_label'] for r in await cur.fetchall()]
        report['timezone'] = 'Europe/Moscow'
        return report
