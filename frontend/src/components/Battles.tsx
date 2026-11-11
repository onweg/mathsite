import { useEffect, useState } from 'react'
import { Markdown } from './Markdown'
import { useStudent } from '../lib/student'
import { ApiError } from '../lib/api'
import { BattleRound, BattleDetail, BattleTask, BattleAttempt, BattleGrade, TaskInput, RoundInput, Reviewer, Rank, battlesApi, reviewerNames } from '../lib/battles'

const btn = 'inline-flex items-center justify-center rounded-lg border border-paper-50/25 px-4 py-2 text-sm hover:border-gold-500 disabled:opacity-40'
const field = 'mt-2 block w-full min-w-0 rounded-lg border border-paper-50/20 bg-ink-950 p-3 text-paper-50'
const panel = 'rounded-xl border border-paper-50/15 p-5 space-y-4 min-w-0 break-words'
const roundStatus = { draft: 'Черновик', open: 'Идёт батл', grading: 'Проверка решений', closed: 'Итоги подведены' }
const taskStatus = { draft: 'Черновик', pending: 'На проверке учителя', published: 'Опубликована' }
const when = (date: string) => new Date(date).toLocaleString('ru-RU')
const gradeScore = (g: BattleGrade) => g.reasoning + g.calculations + g.context

export function Battles({ token }: { token?: string }) {
  const [rounds, setRounds] = useState<BattleRound[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const api = battlesApi(token)
  async function load() {
    setLoading(true)
    try { setRounds(await api.list()); setError('') } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [token])
  if (selected) return <BattleWorkspace key={selected} id={selected} token={token} onBack={() => { setSelected(null); void load() }} />
  return <div className="space-y-6">
    <h2 className="font-serif text-3xl">Математический батл</h2>
    <p className="text-paper-50/65">Придумай задачу, которая пригодится в жизни. Решай задачи других участников, оценивай идеи и соревнуйся за звание лучшего автора и решателя.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="flex flex-wrap gap-3">{token && <button className={btn} onClick={() => setCreating(!creating)}>Создать раунд</button>}<button className={btn} disabled={loading} onClick={() => void load()}>Обновить раунды</button></div>
    {creating && <RoundEditor onSave={async body => { const row = await api.saveRound(body); setCreating(false); setSelected(row.id) }} />}
    {loading && <p>Загрузка раундов…</p>}
    {!loading && !rounds.length && <p className="text-paper-50/60">Учитель пока не запустил ни одного раунда.</p>}
    <div className="grid gap-4 md:grid-cols-2">{rounds.map(r => <button key={r.id} className={`${panel} text-left hover:border-gold-500/50`} onClick={() => setSelected(r.id)}><span className="text-xs text-gold-500">{roundStatus[r.status]}{!r.is_visible && ' · Снят с публикации'}</span><h3 className="font-serif text-2xl">{r.title}</h3><p className="text-sm text-paper-50/60">Проверяют: {r.reviewers.map(role => reviewerNames[role]).join(', ')}</p><p className="text-sm">{r.status === 'closed' ? 'Посмотреть победителей и результаты →' : 'Открыть раунд →'}</p></button>)}</div>
  </div>
}

function RoundEditor({ initial, onSave }: { initial?: BattleRound; onSave: (body: RoundInput) => Promise<void> }) {
  const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [roles, setRoles] = useState<Reviewer[]>(initial?.reviewers ?? ['teacher', 'author', 'ai'])
  const [taskDate, setTaskDate] = useState(localDate(initial ? new Date(initial.task_deadline) : new Date(Date.now() + 7 * 86400_000)))
  const [solveDate, setSolveDate] = useState(localDate(initial ? new Date(initial.solve_deadline) : new Date(Date.now() + 14 * 86400_000)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className={panel} onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('')
    try { await onSave({ title, description, reviewers: roles, task_deadline: new Date(taskDate).toISOString(), solve_deadline: new Date(solveDate).toISOString() }) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }}>
    <label className="block">Название раунда<input className={field} value={title} onChange={e => setTitle(e.target.value)} minLength={3} maxLength={160} required /></label>
    <label className="block">Тема и правила<textarea className={field} value={description} onChange={e => setDescription(e.target.value)} minLength={1} maxLength={4000} required /></label>
    <fieldset className="space-y-2"><legend className="mb-2">Кто оценивает решения</legend>{(Object.keys(reviewerNames) as Reviewer[]).map(role => <label key={role} className="flex items-center gap-3"><input type="checkbox" checked={roles.includes(role)} onChange={e => setRoles(prev => e.target.checked ? [...prev, role] : prev.filter(r => r !== role))} />{reviewerNames[role]}</label>)}</fieldset>
    <div className="grid gap-4 sm:grid-cols-2"><label>Задачи принимаются до<input type="datetime-local" className={field} value={taskDate} onChange={e => setTaskDate(e.target.value)} required /></label><label>Решения и лайки принимаются до<input type="datetime-local" className={field} value={solveDate} min={taskDate} onChange={e => setSolveDate(e.target.value)} required /></label></div>
    <p className="text-xs text-paper-50/60">Время указано в часовом поясе вашего устройства. Одна авторская задача на участника. После запуска сроки и состав проверяющих фиксируются.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <button className={btn} disabled={busy || !roles.length}>{busy ? 'Сохраняем…' : 'Сохранить раунд'}</button>
  </form>
}

function BattleWorkspace({ id, token, onBack }: { id: string; token?: string; onBack: () => void }) {
  const auth = useStudent()
  const [data, setData] = useState<BattleDetail | null>(null)
  const [tab, setTab] = useState('tasks')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingRound, setEditingRound] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const api = battlesApi(token)
  useEffect(() => {
    if (busy) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      try {
        const next = await api.detail(id)
        if (!alive) return
        setData(next)
        if (next.round.status !== 'closed') timer = setTimeout(load, 12_000)
      } catch (e) { if (alive) { setError((e as Error).message); if (e instanceof ApiError && e.status === 404) setData(null); else timer = setTimeout(load, 20_000) } }
    }
    void load()
    return () => { alive = false; clearTimeout(timer) }
  }, [id, token, refresh, auth.status, busy])
  async function act(fn: () => Promise<unknown>) {
    if (busy) return
    setBusy(true); setError('')
    try { await fn(); setData(await api.detail(id)) }
    catch (e) { setError((e as Error).message); throw e }
    finally { setBusy(false) }
  }
  const click = (fn: () => Promise<unknown>) => { void act(fn).catch(() => {}) }
  if (!data) return <div className="space-y-4"><button className={btn} onClick={onBack}>К раундам</button><p role={error ? 'alert' : undefined}>{error || 'Загрузка…'}</p></div>
  const r = data.round
  const mine = data.tasks.find(t => t.own)
  const participant = auth.status === 'authed' && !token
  const myId = auth.status === 'authed' ? auth.student.id : undefined
  return <div className="space-y-6">
    <button className={btn} onClick={onBack}>К раундам</button>
    <div className="space-y-3"><p className="text-gold-500 text-sm">{roundStatus[r.status]}</p><h2 className="font-serif text-3xl">{r.title}</h2><Markdown text={r.description} /><p className="text-sm text-paper-50/60">Задачи до {when(r.task_deadline)} · решения и лайки до {when(r.solve_deadline)}</p><p className="text-sm">Проверяют: {r.reviewers.map(role => reviewerNames[role]).join(', ')}. Итог — среднее всех назначенных оценок, каждая от 0 до 10.</p></div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!token && !participant && <p>Для участия <a href="/me" className="text-gold-500 underline">войдите по личному QR-коду</a>.</p>}
    {token && <div className="flex flex-wrap gap-3">
      {r.status !== 'draft' && <button className={btn} disabled={busy} onClick={() => {
        if (!r.is_visible || confirm('Скрыть раунд от учеников? Задачи, решения, оценки и итоги сохранятся. Сроки раунда продолжат действовать.')) click(() => api.publication(id, !r.is_visible))
      }}>{r.is_visible ? 'Снять с публикации' : 'Опубликовать снова'}</button>}
      <button className={`${btn} text-red-300`} disabled={busy} onClick={async () => {
        if (busy || !confirm(`Удалить раунд «${r.title}» вместе с задачами, решениями, оценками и рейтингом? Это действие нельзя отменить.`)) return
        setBusy(true); setError('')
        try { await api.delete(id); onBack() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
      }}>Удалить раунд</button>
      {r.status === 'draft' && <><button className={btn} onClick={() => setEditingRound(!editingRound)}>Изменить настройки</button><button className={btn} disabled={busy} onClick={() => { if (confirm('Запустить батл? Сроки и состав проверяющих будут зафиксированы.')) click(() => api.transition(id, 'start')) }}>Запустить батл</button></>}
      {r.status === 'open' && <button className={btn} disabled={busy} onClick={() => { if (confirm('Завершить приём задач, решений и лайков? Вернуться к приёму в этом раунде нельзя.')) click(() => api.transition(id, 'stop')) }}>Завершить приём работ</button>}
      {r.status === 'grading' && <><button className={btn} disabled={busy || data.rankings.pending > 0} onClick={() => { if (confirm('Зафиксировать итоговый рейтинг? Изменять оценки после этого нельзя.')) click(() => api.transition(id, 'finalize')) }}>Подвести итоги</button><span className="text-sm self-center">Ждут оценок: {data.rankings.pending}</span></>}
    </div>}
    {token && !r.is_visible && <p className="text-amber-200">Раунд снят с публикации. Ученики его не видят и не могут отправлять работы или голоса. Данные сохранены; сроки не сдвигаются.</p>}
    {token && editingRound && r.status === 'draft' && <RoundEditor initial={r} onSave={async body => { await act(() => api.saveRound(body, id)); setEditingRound(false) }} />}
    <div className="flex flex-wrap gap-2 border-b border-paper-50/15 pb-3" role="tablist" aria-label="Вкладки батла">
      {[['tasks', 'Задачи'], ...(!token ? [['mine', 'Моё участие']] : []), ['reviews', token ? 'Проверка работ' : 'Я проверяю'], ['rankings', 'Итоги и рейтинг']].map(([value, title]) => <button role="tab" aria-selected={tab === value} key={value} className={`${btn} ${tab === value ? 'border-gold-500 text-gold-500' : ''}`} onClick={() => setTab(value)}>{title}</button>)}
      <button className={`${btn} ml-auto`} onClick={() => { setError(''); setRefresh(x => x + 1) }}>Обновить</button>
    </div>
    {tab === 'tasks' && <div className="space-y-5">
      {!data.tasks.length && <p className="text-paper-50/60">Задач пока нет. Своя задача создаётся во вкладке «Моё участие».</p>}
      {data.tasks.map(t => <TaskCard key={t.id} task={t} detail={data} admin={!!token} participant={participant} busy={busy} onAction={(action, note) => act(() => api.taskStatus(id, t.id, action, note))} onLike={() => act(() => api.like(id, t.id, !t.liked))} onAnswer={answer => act(() => api.answer(id, t, answer))} />)}
    </div>}
    {tab === 'mine' && <div className="space-y-6">
      {participant && <><h3 className="font-serif text-2xl">Моя задача</h3>{mine && <p className="text-gold-500">{taskStatus[mine.status]}{mine.moderation_note && ` · ${mine.moderation_note}`}</p>}
        {data.can_author && (!mine || (mine.status === 'draft' && !mine.has_answers)) ? <TaskEditor key={mine ? `${mine.id}-${mine.revision}` : 'new'} initial={mine} onSave={body => act(() => api.saveTask(id, body))} /> : <p className="text-sm text-paper-50/60">{mine?.has_answers ? 'Уже есть решения: условие и эталон зафиксированы.' : mine ? 'Для редактирования верните задачу в черновик, пока открыт приём задач.' : 'Приём авторских задач закрыт.'}</p>}
        {mine && <TaskCard task={mine} detail={data} participant admin={false} busy={busy} onAction={(action, note) => act(() => api.taskStatus(id, mine.id, action, note))} onLike={async () => {}} onAnswer={async () => {}} />}
        <h3 className="font-serif text-2xl">Мои решения</h3>{!data.attempts.some(a => a.own) && <p>Пока нет отправленных решений.</p>}{data.attempts.filter(a => a.own).map(a => <AttemptCard key={a.id} attempt={a} roles={r.reviewers} />)}</>}
      {!participant && <p>Войдите по QR-коду, чтобы участвовать.</p>}
    </div>}
    {tab === 'reviews' && <div className="space-y-5">
      {!token && !r.reviewers.includes('author') && <p>В этом раунде авторы задач не выставляют оценки.</p>}
      {!data.attempts.some(a => !a.own) && <p>Пока нет работ для проверки.</p>}
      {data.attempts.filter(a => !a.own).map(a => <div key={a.id} className={panel}><AttemptCard attempt={a} roles={r.reviewers} />
        {a.can_review && <GradeEditor initial={a.reviews[token ? 'teacher' : 'author']} label={token ? 'Оценка учителя' : 'Оценка автора'} onSave={(grade) => act(() => api.review(id, a.id, token ? 'teacher' : 'author', grade, ''))} />}
        {token && r.status !== 'closed' && <>
          {a.ai_status === 'failed' && <button className={btn} disabled={busy} onClick={() => click(() => api.retry(id, a.id))}>Повторить проверку нейросетью</button>}
          {r.reviewers.filter(role => role !== 'teacher').map(role => <details key={role}><summary className="cursor-pointer text-sm text-gold-500">Корректировка или замена оценки: {reviewerNames[role]}</summary><GradeEditor key={`${a.id}-${role}`} initial={a.reviews[role]} label={`Корректировка: ${reviewerNames[role]}`} correction onSave={(grade, reason) => act(() => api.review(id, a.id, role, grade, reason))} /></details>)}
        </>}
      </div>)}
    </div>}
    {tab === 'rankings' && <div className="space-y-6"><p className="text-paper-50/65">{r.status === 'closed' ? 'Итоги зафиксированы. Поздравляем победителей!' : `Предварительный рейтинг. Решений без полного набора оценок: ${data.rankings.pending}. Они пока не учитываются.`}</p><Ranking title="Топ авторов" rows={data.rankings.authors} myId={myId} /><Ranking title="Топ решателей" rows={data.rankings.solvers} myId={myId} solvers /><p className="text-xs text-paper-50/60">Авторы — по лайкам на опубликованной задаче. Решатели — по сумме средних оценок за разные задачи. При равных баллах участники делят место.</p></div>}
  </div>
}

function TaskEditor({ initial, onSave }: { initial?: BattleTask; onSave: (body: TaskInput) => Promise<unknown> }) {
  const [draft, setDraft] = useState<TaskInput>({ title: initial?.title ?? '', question: initial?.question ?? '', practical_use: initial?.practical_use ?? '', reference: initial?.reference ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className={panel} onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await onSave(draft) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }}>
    <p className="text-sm text-paper-50/60">Одна задача на раунд. Сначала сохраните черновик, затем отправьте учителю на публикацию. При изменении условия прежние лайки сбрасываются.</p>
    {([['title', 'Название задачи', 3, 160], ['question', 'Условие задачи', 10, 5000], ['practical_use', 'Где пригодится в жизни', 5, 1500], ['reference', 'Эталонное решение и ответ', 5, 5000]] as const).map(([key, label, min, max]) => <label key={key} className="block">{label}<textarea className={field} rows={key === 'title' ? 1 : 4} value={draft[key]} onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))} minLength={min} maxLength={max} required /></label>)}
    <p className="text-xs text-paper-50/60">Эталон увидят учитель и назначенная нейросеть. Остальным ученикам он откроется после подведения итогов.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}<button className={btn} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить задачу'}</button>
  </form>
}

function TaskCard({ task: t, detail, admin, participant, busy, onAction, onLike, onAnswer }: { task: BattleTask; detail: BattleDetail; admin: boolean; participant: boolean; busy: boolean; onAction: (action: string, note?: string) => Promise<unknown>; onLike: () => Promise<unknown>; onAnswer: (answer: string) => Promise<unknown> }) {
  const [answer, setAnswer] = useState('')
  const [solving, setSolving] = useState(false)
  const [note, setNote] = useState('')
  const done = detail.attempts.some(a => a.own && a.task_id === t.id)
  const act = (fn: () => Promise<unknown>) => { void fn().catch(() => {}) }
  return <article className={panel}>
    <div className="flex flex-wrap justify-between gap-3"><h3 className="font-serif text-2xl">{t.title}</h3><span className="text-xs text-gold-500">{taskStatus[t.status]}</span></div>
    <p className="text-xs text-paper-50/60">Автор: {t.author_name} · Лайки: {t.likes}</p><Markdown text={t.question} /><p className="text-sm text-sage-300">В жизни: {t.practical_use}</p>
    {t.reference && <details><summary className="cursor-pointer text-sm text-gold-500">Эталонное решение</summary><Markdown text={t.reference} /></details>}
    {t.moderation_note && <p className="text-sm">Комментарий учителя: {t.moderation_note}</p>}
    <div className="flex flex-wrap gap-3">
      {t.own && detail.can_author && t.status === 'draft' && <button className={btn} disabled={busy} onClick={() => act(() => onAction('submit'))}>На проверку учителю</button>}
      {(t.own || admin) && detail.can_solve && t.status !== 'draft' && <button className={btn} disabled={busy} onClick={() => { if (confirm('Снять задачу с публикации/проверки? Сохранённые решения останутся.')) act(() => onAction('withdraw')) }}>Вернуть в черновик</button>}
      {participant && !t.own && t.status === 'published' && <><button className={btn} disabled={busy || !detail.can_solve} aria-pressed={t.liked} onClick={() => act(onLike)}>{t.liked ? 'Снять лайк' : 'Поставить лайк'}</button>{done ? <span className="self-center text-sm text-sage-300">Решение отправлено · см. «Моё участие»</span> : <button className={btn} disabled={!detail.can_solve} onClick={() => setSolving(!solving)}>Решить задачу</button>}</>}
    </div>
    {admin && t.status === 'pending' && detail.can_solve && <div className="space-y-3"><p className="text-sm text-paper-50/65">Проверьте условие, практический смысл и эталон перед публикацией.</p><label className="block">Комментарий автору<textarea className={field} value={note} onChange={e => setNote(e.target.value)} maxLength={1500} /></label><div className="flex flex-wrap gap-3"><button className={btn} disabled={busy} onClick={() => { if (confirm('Условие и эталон проверены? Опубликовать задачу?')) act(() => onAction('approve', note)) }}>Одобрить и опубликовать</button><button className={btn} disabled={busy || note.trim().length < 3} onClick={() => act(() => onAction('return', note))}>Вернуть на доработку</button></div></div>}
    {solving && !done && <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (busy || !confirm('Отправить окончательное решение? Доступна одна попытка, изменить ответ будет нельзя.')) return; try { await onAnswer(answer); setSolving(false) } catch { /* parent displays the error */ } }}><label className="block">Моё решение<textarea className={`${field} min-h-40`} value={answer} onChange={e => setAnswer(e.target.value)} minLength={5} maxLength={6000} required placeholder="Объясни ход решения, приведи вычисления и ответ в контексте задачи." /></label><button className={btn} disabled={busy || !detail.can_solve}>Отправить решение</button></form>}
  </article>
}

function AttemptCard({ attempt: a, roles }: { attempt: BattleAttempt; roles: Reviewer[] }) {
  const scores = Object.values(a.reviews).map(gradeScore)
  return <article className={panel}>
    <h4 className="font-serif text-xl">{a.snapshot.title}</h4><p className="text-sm text-paper-50/60">{a.student_name ?? (a.own ? 'Моё решение' : 'Анонимная работа')} · {when(a.created_at)}</p>
    <details><summary className="cursor-pointer text-sm">Условие задачи{a.snapshot.reference ? ' и эталон' : ''}</summary><Markdown text={a.snapshot.question} />{a.snapshot.reference && <Markdown text={a.snapshot.reference} />}</details>
    <Markdown text={a.answer} />
    <p className="font-mono text-gold-500">{a.score === null ? 'Ожидает полного набора оценок' : `Итог: ${a.score} / 10`}</p>
    {scores.length > 1 && Math.max(...scores) - Math.min(...scores) >= 4 && <p className="text-sm text-amber-300">Есть расхождение оценок: требуется внимание учителя.</p>}
    {roles.map(role => { const grade = a.reviews[role]; return <div key={role} className="border-l border-paper-50/20 pl-3 text-sm space-y-2"><p className="text-gold-500">{grade ? grade.corrected_by_teacher ? `${reviewerNames[role]} · оценка скорректирована учителем` : role === 'ai' ? 'Проверено нейросетью' : `Проверено: ${reviewerNames[role]}` : `${reviewerNames[role]} · ${role === 'ai' && a.ai_status === 'failed' ? 'сбой проверки — нужна помощь учителя' : 'ожидается оценка или скрыта до вашей проверки'}`}{grade && ` · ${gradeScore(grade)} / 10`}</p>{grade && <><p className="text-xs text-paper-50/60">Рассуждения {grade.reasoning}/4 · вычисления {grade.calculations}/4 · жизненный контекст {grade.context}/2</p><Markdown text={grade.feedback} />{grade.correction_reason && <p>Причина корректировки: {grade.correction_reason}</p>}</>}{!!a.review_history[role]?.length && <details><summary>История оценок ({a.review_history[role]!.length})</summary>{a.review_history[role]!.map((h, i) => <p key={i}>{when(h.at)} · {gradeScore(h.data)} / 10 · {h.data.feedback}</p>)}</details>}</div> })}
  </article>
}

function GradeEditor({ initial, label, correction = false, onSave }: { initial?: BattleGrade; label: string; correction?: boolean; onSave: (grade: BattleGrade, reason: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [grade, setGrade] = useState<BattleGrade>({ reasoning: 0, calculations: 0, context: 0, feedback: '' })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="space-y-3"><button className={btn} onClick={() => { if (!open && initial) setGrade({ reasoning: initial.reasoning, calculations: initial.calculations, context: initial.context, feedback: initial.feedback }); setOpen(!open) }}>{label}</button>
    {open && <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await onSave(grade, reason); setOpen(false) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }}>
      {([['reasoning', 'Рассуждения (0–4)', 4], ['calculations', 'Вычисления и ответ (0–4)', 4], ['context', 'Жизненный контекст (0–2)', 2]] as const).map(([key, title, max]) => <label key={key} className="block">{title}<input className={field} type="number" min={0} max={max} step={1} required value={grade[key]} onChange={e => setGrade(g => ({ ...g, [key]: Number(e.target.value) }))} /></label>)}
      <label className="block">Обратная связь<textarea className={field} minLength={3} maxLength={2500} required value={grade.feedback} onChange={e => setGrade(g => ({ ...g, feedback: e.target.value }))} /></label>
      {correction && <label className="block">Причина корректировки или замены<textarea className={field} minLength={5} maxLength={1500} required value={reason} onChange={e => setReason(e.target.value)} /></label>}
      {error && <p role="alert" className="text-red-300">{error}</p>}<button className={btn} disabled={busy}>Сохранить оценку</button>
    </form>}
  </div>
}

function Ranking({ title, rows, myId, solvers = false }: { title: string; rows: Rank[]; myId?: string; solvers?: boolean }) {
  const leaders = rows.filter(row => row.place === 1 && row.score > 0)
  return <section className={panel}><h3 className="font-serif text-2xl">{title}</h3>{leaders.length > 0 && <p className="text-gold-500">{leaders.length === 1 ? 'Лидер' : 'Лидеры'}: {leaders.map(row => row.name).join(', ')}</p>}
    {!rows.length ? <p className="text-paper-50/60">Пока нет результатов.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-paper-50/15"><th className="p-2">Место</th><th className="p-2">Ученик</th><th className="p-2">{solvers ? 'Баллы' : 'Лайки'}</th>{solvers && <><th className="p-2">Решений</th><th className="p-2">Средний балл</th></>}</tr></thead><tbody>{rows.map(row => <tr key={row.student_id} className={`border-b border-paper-50/10 ${row.student_id === myId ? 'bg-gold-500/10 text-gold-500' : ''}`}><td className="p-2">{row.place}</td><td className="p-2">{row.name}{row.student_id === myId ? ' · это ты' : ''}<span className="block text-xs text-paper-50/50">{row.class_label}{row.title ? ` · ${row.title}` : ''}</span></td><td className="p-2">{row.score}</td>{solvers && <><td className="p-2">{row.count}</td><td className="p-2">{row.average}</td></>}</tr>)}</tbody></table></div>}
  </section>
}
