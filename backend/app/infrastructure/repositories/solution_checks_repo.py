from uuid import UUID, uuid4

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.core.errors import Conflict, NotFound


class SolutionChecksRepository:
    def __init__(self, pool):
        self.pool = pool

    async def list_tasks(self, *, public=False):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT * FROM solution_tasks WHERE (%s = FALSE OR status='published') ORDER BY created_at DESC", (public,))
            return await cur.fetchall()

    async def get_task(self, task_id):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            await cur.execute('SELECT * FROM solution_tasks WHERE id=%s', (task_id,))
            row = await cur.fetchone()
        if not row:
            raise NotFound('задание не найдено')
        return row

    async def save_task(self, data, user_id, task_id=None):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            if task_id:
                await cur.execute("UPDATE solution_tasks SET data=%s, revision=revision+1, updated_at=now() WHERE id=%s AND status='draft' RETURNING *", (Jsonb(data), task_id))
            else:
                await cur.execute('INSERT INTO solution_tasks (data,created_by) VALUES (%s,%s) RETURNING *', (Jsonb(data), user_id))
            row = await cur.fetchone()
            if not row:
                raise Conflict('для редактирования сначала сними задание с публикации')
            return row

    async def publication(self, task_id, published):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            await cur.execute('UPDATE solution_tasks SET status=%s, revision=revision+1, updated_at=now() WHERE id=%s RETURNING *', ('published' if published else 'draft', task_id))
            row = await cur.fetchone()
            if not row:
                raise NotFound('задание не найдено')
            return row

    async def submit(self, task_id, student_id, body):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            await cur.execute('SELECT * FROM solution_tasks WHERE id=%s FOR SHARE', (task_id,))
            task = await cur.fetchone()
            if not task or task['status'] != 'published':
                raise Conflict('приём ответов на это задание закрыт')
            if task['revision'] != body.revision:
                raise Conflict('задание изменилось; открой его заново')
            ids = {s['id'] for s in task['data']['solutions']}
            if set(body.solution_order) != ids or len(body.solution_order) != 4:
                raise Conflict('порядок решений не соответствует заданию; открой его заново')
            if body.selected_id not in ids or set(body.explanations) != ids - {body.selected_id}:
                raise Conflict('выбери одно решение и объясни ошибки в трёх остальных')
            if any(not t.strip() or len(t) > 2000 for t in body.explanations.values()):
                raise Conflict('каждое объяснение должно содержать от 1 до 2000 символов')
            answer = dict(selected_id=body.selected_id, explanations=body.explanations)
            by_id = {s['id']: s for s in task['data']['solutions']}
            snapshot = task['data'] | dict(solutions=[by_id[i] for i in body.solution_order])
            await cur.execute('''INSERT INTO solution_attempts (task_id,student_id,snapshot,answer)
                VALUES (%s,%s,%s,%s) ON CONFLICT (task_id,student_id) DO NOTHING RETURNING id''',
                (task_id, student_id, Jsonb(snapshot), Jsonb(answer)))
            row = await cur.fetchone()
            if row:
                return row['id']
            await cur.execute('SELECT id, answer FROM solution_attempts WHERE task_id=%s AND student_id=%s', (task_id, student_id))
            previous = await cur.fetchone()
            if previous['answer'] != answer:
                raise Conflict('ты уже отправил ответ; доступна одна попытка')
            return previous['id']  # retry after a lost HTTP response does not enqueue again

    async def delete_task(self, task_id):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            # Serialize deletion with publication/editing and incoming answers.
            await cur.execute('SELECT data FROM solution_tasks WHERE id=%s FOR UPDATE', (task_id,))
            task = await cur.fetchone()
            if not task:
                raise NotFound('задание не найдено')
            await cur.execute('DELETE FROM solution_attempts WHERE task_id=%s', (task_id,))
            await cur.execute('DELETE FROM solution_tasks WHERE id=%s', (task_id,))

    async def attempts(self, *, student_id=None, task_id=None):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            if student_id:
                await cur.execute('SELECT a.* FROM solution_attempts a WHERE student_id=%s ORDER BY created_at DESC', (student_id,))
            else:
                await cur.execute('''SELECT a.*, s.name AS student_name, s.class_label
                    FROM solution_attempts a JOIN students s ON s.id=a.student_id
                    WHERE task_id=%s ORDER BY a.created_at DESC''', (task_id,))
            return await cur.fetchall()

    async def attempt(self, attempt_id, student_id=None):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            await cur.execute('SELECT * FROM solution_attempts WHERE id=%s AND (%s::uuid IS NULL OR student_id=%s)', (attempt_id, student_id, student_id))
            row = await cur.fetchone()
        if not row:
            raise NotFound('ответ не найден')
        return row

    async def claim(self):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("UPDATE solution_attempts SET status='failed', lease_id=NULL WHERE status='checking' AND lease_until < now() AND tries >= 3")
            await cur.execute('''SELECT * FROM solution_attempts WHERE tries < 3 AND
                ((status='queued' AND next_run_at <= now()) OR (status='checking' AND lease_until < now()))
                ORDER BY next_run_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED''')
            row = await cur.fetchone()
            if not row:
                return None
            lease = uuid4()
            await cur.execute("UPDATE solution_attempts SET status='checking', tries=tries+1, lease_id=%s, lease_until=now()+interval '3 minutes' WHERE id=%s", (lease, row['id']))
            return row | dict(lease_id=lease, tries=row['tries'] + 1)

    async def complete(self, job, result, model_version, usage):
        async with self.pool.connection() as conn:
            await conn.execute("""UPDATE solution_attempts SET status='graded', ai_result=%s,
                model_version=%s, usage=%s, graded_at=now(), lease_id=NULL, lease_until=NULL
                WHERE id=%s AND status='checking' AND lease_id=%s""",
                (Jsonb(result), model_version, Jsonb(usage), job['id'], job['lease_id']))

    async def fail(self, job):
        async with self.pool.connection() as conn:
            await conn.execute("""UPDATE solution_attempts SET status=%s, lease_id=NULL, lease_until=NULL,
                next_run_at=now()+%s * interval '15 seconds'
                WHERE id=%s AND status='checking' AND lease_id=%s""",
                ('failed' if job['tries'] >= 3 else 'queued', job['tries'] ** 2, job['id'], job['lease_id']))

    async def retry(self, attempt_id):
        async with self.pool.connection() as conn:
            cursor = await conn.execute("UPDATE solution_attempts SET status='queued', tries=0, next_run_at=now() WHERE id=%s AND status='failed'", (attempt_id,))
            if not cursor.rowcount:
                raise Conflict('повторная проверка доступна только после ошибки сервиса')

    async def teacher_grade(self, attempt_id, result, user_id):
        async with self.pool.connection() as conn:
            cursor = await conn.execute("""UPDATE solution_attempts SET teacher_result=%s,
                status='graded', graded_at=now(), lease_id=NULL, lease_until=NULL WHERE id=%s""",
                (Jsonb(result | dict(teacher_id=str(user_id))), attempt_id))
            if not cursor.rowcount:
                raise NotFound('ответ не найден')
