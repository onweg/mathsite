"""Round row locks serialize rule changes, participation and finalization.

All mutation paths lock round -> task/attempt, including the AI worker. This
keeps frozen results and deadline checks consistent under concurrent requests.
"""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.core.errors import Conflict, Forbidden, NotFound
from app.domain.battles import average, rounded, review_score


class BattlesRepository:
    def __init__(self, pool):
        self.pool = pool

    @asynccontextmanager
    async def cursor(self):
        async with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            yield cur

    async def round(self, cur, rid, lock=False):
        await cur.execute('SELECT * FROM battle_rounds WHERE id=%s' + (' FOR UPDATE' if lock else ''), (rid,))
        row = await cur.fetchone()
        if not row:
            raise NotFound('Раунд не найден')
        return row

    def accepting(self, row, tasks=False):
        if row['status'] != 'open' or datetime.now(timezone.utc) >= row['task_deadline' if tasks else 'solve_deadline']:
            raise Conflict('Приём задач закрыт' if tasks else 'Приём решений и голосов закрыт')

    async def list(self, admin=False):
        async with self.cursor() as cur:
            await cur.execute("SELECT * FROM battle_rounds WHERE (%s OR status <> 'draft') ORDER BY created_at DESC", (admin,))
            return [self.round_dto(r) for r in await cur.fetchall()]

    def round_dto(self, row):
        return {k: row[k] for k in ('id', 'title', 'description', 'reviewers', 'task_deadline', 'solve_deadline', 'status')}

    async def save_round(self, body, rid=None):
        async with self.cursor() as cur:
            if rid and (await self.round(cur, rid, True))['status'] != 'draft':
                raise Conflict('Правила можно менять только до запуска раунда')
            values = (body.title, body.description, Jsonb(body.reviewers), body.task_deadline, body.solve_deadline)
            if rid:
                await cur.execute('UPDATE battle_rounds SET title=%s,description=%s,reviewers=%s,task_deadline=%s,solve_deadline=%s WHERE id=%s RETURNING *', (*values, rid))
            else:
                await cur.execute('INSERT INTO battle_rounds(title,description,reviewers,task_deadline,solve_deadline) VALUES (%s,%s,%s,%s,%s) RETURNING *', values)
            return self.round_dto(await cur.fetchone())

    async def transition(self, rid, action):
        async with self.cursor() as cur:
            row = await self.round(cur, rid, True)
            expected, target = {'start': ('draft', 'open'), 'stop': ('open', 'grading'), 'finalize': ('grading', 'closed')}[action]
            if row['status'] != expected:
                raise Conflict('Этот переход уже выполнен или недоступен')
            if action == 'start' and row['task_deadline'] <= datetime.now(timezone.utc):
                raise Conflict('Укажите будущие сроки до запуска')
            results = None
            if action == 'finalize':
                results = await self.rankings(cur, row)
                if results['pending']:
                    raise Conflict(f"Остались непроверенные решения: {results['pending']}")
            await cur.execute('UPDATE battle_rounds SET status=%s,results=%s WHERE id=%s', (target, Jsonb(results) if results else None, rid))

    async def task(self, cur, rid, tid):
        await cur.execute('SELECT * FROM battle_tasks WHERE id=%s AND round_id=%s', (tid, rid))
        task = await cur.fetchone()
        if not task:
            raise NotFound('Задача не найдена')
        return task

    async def save_task(self, rid, sid, body):
        async with self.cursor() as cur:
            self.accepting(await self.round(cur, rid, True), tasks=True)
            await cur.execute('SELECT * FROM battle_tasks WHERE round_id=%s AND author_id=%s', (rid, sid))
            old = await cur.fetchone()
            if old:
                if old['status'] != 'draft':
                    raise Conflict('Сначала снимите задачу с публикации или проверки')
                await cur.execute('SELECT 1 FROM battle_attempts WHERE task_id=%s LIMIT 1', (old['id'],))
                if await cur.fetchone():
                    raise Conflict('На задачу уже прислали решения. Условие и эталон менять нельзя')
                if old['data'] != body.model_dump():
                    await cur.execute('DELETE FROM battle_likes WHERE task_id=%s', (old['id'],))
                    await cur.execute("UPDATE battle_tasks SET data=%s,revision=revision+1,moderation_note='' WHERE id=%s", (Jsonb(body.model_dump()), old['id']))
                return old['id']
            await cur.execute('INSERT INTO battle_tasks(round_id,author_id,data) VALUES (%s,%s,%s) RETURNING id', (rid, sid, Jsonb(body.model_dump())))
            return (await cur.fetchone())['id']

    async def task_action(self, rid, tid, action, sid=None, admin=False, note=''):
        async with self.cursor() as cur:
            row = await self.round(cur, rid, True)
            if row['status'] != 'open':
                raise Conflict('Раунд не принимает изменения публикаций')
            task = await self.task(cur, rid, tid)
            if not admin and task['author_id'] != sid:
                raise Forbidden('Можно управлять только своей задачей')
            if action == 'submit':
                self.accepting(row, tasks=True)
                if task['status'] != 'draft':
                    raise Conflict('Задача уже отправлена')
                status = 'pending'
            elif action == 'approve' and admin:
                self.accepting(row)
                if task['status'] != 'pending':
                    raise Conflict('На проверке нет этой задачи')
                status = 'published'
            elif action == 'withdraw' or (action == 'return' and admin):
                self.accepting(row)
                status = 'draft'
            else:
                raise Forbidden('Действие недоступно')
            await cur.execute('UPDATE battle_tasks SET status=%s,revision=revision+1,moderation_note=%s WHERE id=%s', (status, note if admin else task['moderation_note'], tid))

    async def like(self, rid, tid, sid, enabled):
        async with self.cursor() as cur:
            self.accepting(await self.round(cur, rid, True))
            task = await self.task(cur, rid, tid)
            if task['status'] != 'published' or task['author_id'] == sid:
                raise Conflict('Лайк можно поставить только опубликованной чужой задаче')
            if enabled:
                await cur.execute('INSERT INTO battle_likes(task_id,student_id) VALUES (%s,%s) ON CONFLICT DO NOTHING', (tid, sid))
            else:
                await cur.execute('DELETE FROM battle_likes WHERE task_id=%s AND student_id=%s', (tid, sid))

    async def answer(self, rid, tid, sid, body):
        async with self.cursor() as cur:
            row = await self.round(cur, rid, True)
            task = await self.task(cur, rid, tid)
            await cur.execute('SELECT id,answer FROM battle_attempts WHERE task_id=%s AND student_id=%s', (tid, sid))
            previous = await cur.fetchone()
            if previous:
                if previous['answer'] == body.answer:
                    return previous['id']  # safe retry after a lost response
                raise Conflict('Решение уже отправлено: одна попытка на задачу')
            self.accepting(row)
            if task['author_id'] == sid or task['status'] != 'published':
                raise Conflict('Можно решать только опубликованные чужие задачи')
            if task['revision'] != body.revision:
                raise Conflict('Задача изменилась. Откройте её заново')
            await cur.execute('INSERT INTO battle_attempts(task_id,student_id,snapshot,answer,ai_status) VALUES (%s,%s,%s,%s,%s) RETURNING id',
                              (tid, sid, Jsonb(task['data']), body.answer, 'queued' if 'ai' in row['reviewers'] else 'disabled'))
            return (await cur.fetchone())['id']

    async def attempt(self, cur, rid, aid):
        await cur.execute('''SELECT a.*,t.author_id FROM battle_attempts a JOIN battle_tasks t ON t.id=a.task_id
            WHERE a.id=%s AND t.round_id=%s''', (aid, rid))
        attempt = await cur.fetchone()
        if not attempt:
            raise NotFound('Решение не найдено')
        return attempt

    async def put_review(self, cur, aid, role, data):
        await cur.execute('''INSERT INTO battle_reviews(attempt_id,role,data) VALUES (%s,%s,%s)
            ON CONFLICT(attempt_id,role) DO UPDATE SET history=battle_reviews.history ||
            jsonb_build_array(jsonb_build_object('data',battle_reviews.data,'at',battle_reviews.updated_at)),
            data=EXCLUDED.data, updated_at=now()''', (aid, role, Jsonb(data)))

    async def review(self, rid, aid, role, body, sid=None, admin=False, reason=''):
        async with self.cursor() as cur:
            row = await self.round(cur, rid, True)
            if row['status'] not in ('open', 'grading'):
                raise Conflict('Оценки раунда уже зафиксированы или раунд не начат')
            attempt = await self.attempt(cur, rid, aid)
            if role not in row['reviewers']:
                raise Conflict('Этот проверяющий не участвует в раунде')
            if not admin and (role != 'author' or attempt['author_id'] != sid):
                raise Forbidden('Можно проверять только решения своей задачи')
            if not admin:
                await cur.execute('SELECT data FROM battle_reviews WHERE attempt_id=%s AND role=%s', (aid, role))
                previous = await cur.fetchone()
                if previous and previous['data'].get('corrected_by_teacher'):
                    raise Conflict('Эту оценку уже скорректировал учитель')
            if admin and role != 'teacher' and len(reason.strip()) < 5:
                raise Conflict('Для корректировки чужой оценки укажите причину')
            data = body.model_dump()
            if admin and role != 'teacher':
                data.update(corrected_by_teacher=True, correction_reason=reason.strip())
            await self.put_review(cur, aid, role, data)
            if role == 'ai':
                await cur.execute("UPDATE battle_attempts SET ai_status='graded',lease_id=NULL,lease_until=NULL WHERE id=%s", (aid,))

    async def reviews(self, cur, rid):
        await cur.execute('''SELECT r.* FROM battle_reviews r JOIN battle_attempts a ON a.id=r.attempt_id
            JOIN battle_tasks t ON t.id=a.task_id WHERE t.round_id=%s''', (rid,))
        result = {}
        for review in await cur.fetchall():
            result.setdefault(review['attempt_id'], {})[review['role']] = review
        return result

    async def rankings(self, cur, row):
        reviews = await self.reviews(cur, row['id'])
        await cur.execute('''SELECT a.id,a.student_id,s.name,s.class_label FROM battle_attempts a
            JOIN battle_tasks t ON t.id=a.task_id JOIN students s ON s.id=a.student_id WHERE t.round_id=%s''', (row['id'],))
        solvers, pending = {}, 0
        for a in await cur.fetchall():
            score = average({k: v['data'] for k, v in reviews.get(a['id'], {}).items()}, row['reviewers'])
            if score is None:
                pending += 1
                continue
            person = solvers.setdefault(str(a['student_id']), dict(student_id=str(a['student_id']), name=a['name'], class_label=a['class_label'], score=Decimal(0), count=0))
            # Every attempt in a round has the same reviewer count. Accumulate
            # integer numerators before dividing, so three 1/3 scores tie with 1.
            person['score'] += sum(review_score(reviews[a['id']][role]['data']) for role in row['reviewers'])
            person['count'] += 1
        for person in solvers.values():
            person['score'] /= len(row['reviewers'])
        await cur.execute('''SELECT t.id,t.author_id AS student_id,s.name,s.class_label,t.data->>'title' AS title,count(l.student_id) AS score
            FROM battle_tasks t JOIN students s ON s.id=t.author_id LEFT JOIN battle_likes l ON l.task_id=t.id
            WHERE t.round_id=%s AND t.status='published' GROUP BY t.id,s.name,s.class_label''', (row['id'],))
        authors = [dict(a, id=str(a['id']), student_id=str(a['student_id'])) for a in await cur.fetchall()]
        def ranked(items):
            items.sort(key=lambda a: (-a['score'], a['name'], a['student_id']))
            place, previous = 0, None
            for index, item in enumerate(items):
                if item['score'] != previous:
                    place, previous = index + 1, item['score']
                item['place'] = place
                if isinstance(item['score'], Decimal):
                    item['average'] = rounded(item['score'] / item['count'])
                    item['score'] = rounded(item['score'])
            return items
        return dict(authors=ranked(authors), solvers=ranked(list(solvers.values())), pending=pending)

    async def detail(self, rid, sid=None, admin=False):
        async with self.cursor() as cur:
            # Consistent snapshot with mutations/finalization; no LLM calls under this lock.
            row = await self.round(cur, rid, True)
            if row['status'] == 'draft' and not admin:
                raise NotFound('Раунд ещё не запущен')
            await cur.execute('''SELECT t.*,coalesce(s.name,'Удалённый ученик') AS author_name,
                (SELECT count(*) FROM battle_likes l WHERE l.task_id=t.id) AS likes,
                EXISTS(SELECT 1 FROM battle_likes l WHERE l.task_id=t.id AND l.student_id=%s) AS liked,
                EXISTS(SELECT 1 FROM battle_attempts a WHERE a.task_id=t.id) AS has_answers
                FROM battle_tasks t LEFT JOIN students s ON s.id=t.author_id WHERE t.round_id=%s ORDER BY t.created_at''', (sid, rid))
            tasks = []
            for t in await cur.fetchall():
                own = sid is not None and t['author_id'] == sid
                if not admin and not own and t['status'] != 'published':
                    continue
                data = dict(t['data'])
                if not admin and not own and row['status'] != 'closed':
                    data.pop('reference', None)
                tasks.append(dict(data, id=t['id'], revision=t['revision'], status=t['status'], author_name=t['author_name'], own=own,
                                  likes=t['likes'], liked=t['liked'], has_answers=t['has_answers'], moderation_note=t['moderation_note'] if admin or own else ''))
            reviews = await self.reviews(cur, rid)
            await cur.execute('''SELECT a.*,t.author_id,s.name AS student_name FROM battle_attempts a
                JOIN battle_tasks t ON t.id=a.task_id JOIN students s ON s.id=a.student_id
                WHERE t.round_id=%s AND (%s OR a.student_id=%s OR (t.author_id=%s AND %s)) ORDER BY a.created_at''',
                              (rid, admin, sid, sid, 'author' in row['reviewers']))
            attempts = []
            for a in await cur.fetchall():
                own = a['student_id'] == sid
                grades = reviews.get(a['id'], {})
                role = 'teacher' if admin else 'author'
                visible = own or role in grades or role not in row['reviewers'] or row['status'] == 'closed'
                data = {k: v['data'] for k, v in grades.items()}
                mean = average(data, row['reviewers'])
                snapshot = dict(a['snapshot'])
                if not admin and own and row['status'] != 'closed':
                    snapshot.pop('reference', None)
                attempts.append(dict(id=a['id'], task_id=a['task_id'], own=own, snapshot=snapshot, answer=a['answer'], ai_status=a['ai_status'],
                                     student_name=a['student_name'] if admin else None, created_at=a['created_at'],
                                     reviews=data if visible else {k: v for k, v in data.items() if k == role},
                                     review_history={k: v['history'] for k, v in grades.items()} if admin else {},
                                     score=rounded(mean) if visible and mean is not None else None,
                                     can_review=row['status'] in ('open', 'grading') and role in row['reviewers'] and not own
                                     and (admin or not data.get(role, {}).get('corrected_by_teacher'))))
            return dict(round=self.round_dto(row), tasks=tasks, attempts=attempts,
                        rankings=row['results'] if row['status'] == 'closed' else await self.rankings(cur, row),
                        can_author=row['status'] == 'open' and datetime.now(timezone.utc) < row['task_deadline'],
                        can_solve=row['status'] == 'open' and datetime.now(timezone.utc) < row['solve_deadline'])

    async def retry(self, rid, aid):
        async with self.cursor() as cur:
            row = await self.round(cur, rid, True)
            await self.attempt(cur, rid, aid)
            if row['status'] not in ('open', 'grading') or 'ai' not in row['reviewers']:
                raise Conflict('Проверка недоступна')
            await cur.execute("UPDATE battle_attempts SET ai_status='queued',tries=0,next_run_at=now() WHERE id=%s AND ai_status='failed'", (aid,))
            if not cur.rowcount:
                raise Conflict('Повтор доступен только после ошибки проверки')

    async def claim(self):
        async with self.cursor() as cur:
            # Lock the parent first, matching every other mutation's lock order.
            await cur.execute('''SELECT r.* FROM battle_rounds r WHERE r.status IN ('open','grading') AND EXISTS (
                SELECT 1 FROM battle_attempts a JOIN battle_tasks t ON t.id=a.task_id WHERE t.round_id=r.id
                AND ((a.ai_status='queued' AND a.next_run_at<=now()) OR (a.ai_status='checking' AND a.lease_until<now())))
                ORDER BY r.created_at LIMIT 1 FOR UPDATE SKIP LOCKED''')
            row = await cur.fetchone()
            if not row:
                return None
            await cur.execute('''SELECT a.* FROM battle_attempts a JOIN battle_tasks t ON t.id=a.task_id WHERE t.round_id=%s
                AND ((a.ai_status='queued' AND a.next_run_at<=now()) OR (a.ai_status='checking' AND a.lease_until<now()))
                ORDER BY a.next_run_at LIMIT 1''', (row['id'],))
            job = await cur.fetchone()
            if job['tries'] >= 3:
                await cur.execute("UPDATE battle_attempts SET ai_status='failed',lease_id=NULL WHERE id=%s", (job['id'],))
                return None
            lease = uuid4()
            await cur.execute("UPDATE battle_attempts SET ai_status='checking',tries=tries+1,lease_id=%s,lease_until=now()+interval '3 minutes' WHERE id=%s", (lease, job['id']))
            return dict(job, round_id=row['id'], lease_id=lease, tries=job['tries'] + 1)

    async def finish_job(self, job, result=None):
        async with self.cursor() as cur:
            row = await self.round(cur, job['round_id'], True)
            a = await self.attempt(cur, row['id'], job['id'])
            if row['status'] not in ('open', 'grading') or a['ai_status'] != 'checking' or a['lease_id'] != job['lease_id']:
                return
            if result is not None:
                await self.put_review(cur, job['id'], 'ai', result)
            status = 'graded' if result is not None else ('failed' if job['tries'] >= 3 else 'queued')
            await cur.execute("UPDATE battle_attempts SET ai_status=%s,lease_id=NULL,lease_until=NULL,next_run_at=now()+%s * interval '15 seconds' WHERE id=%s", (status, job['tries'] ** 2, job['id']))
