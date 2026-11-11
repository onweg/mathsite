import { useEffect, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { SolutionAttemptCard } from '../../components/SolutionAttempt'
import { adminSolutionChecks as api, ExerciseInput, SolutionTask, SolutionAttempt } from '../../lib/solutionChecks'

const btn = 'rounded-lg border border-paper-50/25 px-4 py-2 text-sm disabled:opacity-40 hover:border-gold-500'
const field = 'mt-1 block w-full rounded-lg border border-paper-50/20 bg-ink-950 p-3 text-paper-50'
const blank = (): ExerciseInput => ({ title: '', topic: '', difficulty: 'medium', question_md: '', solutions: Array.from({ length: 4 }, (_, i) => ({ id: String(i), body_md: '', is_correct: i === 0, error_explanation: '' })) })

export function SolutionChecksPage({ token }: { token: string }) {
  const [rows, setRows] = useState<SolutionTask[]>([])
  const [editing, setEditing] = useState<SolutionTask | 'new' | null>(null)
  const [generating, setGenerating] = useState(false)
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('medium')
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function load() { try { setRows(await api.list(token)) } catch (e) { setError((e as Error).message) } }
  useEffect(() => { void load() }, [token])
  async function generate(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { setEditing(await api.generate(token, { topic, difficulty, hint })); setGenerating(false) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  if (editing) return <SolutionEditor key={editing === 'new' ? 'new' : `${editing.id}-${editing.revision}`} task={editing === 'new' ? null : editing} token={token} onSaved={setEditing} onBack={() => { setEditing(null); void load() }} />
  return <div className="space-y-6">
    <h2 className="font-serif text-2xl">Проверь решение</h2>
    <p className="text-sm text-paper-50/65">Одно задание, четыре решения, одно правильное. Ученики выбирают решение и объясняют ошибки в остальных. После сдачи объяснения проверяет нейросеть; вы можете исправить её оценку.</p>
    <div className="flex flex-wrap gap-3"><button className={btn} onClick={() => setGenerating(!generating)} disabled={busy}>Сгенерировать задание</button><button className={btn} onClick={() => setEditing('new')} disabled={busy}>Создать вручную</button></div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {generating && <form onSubmit={generate} className="rounded-xl border border-gold-500/30 p-5 space-y-4">
      <label className="block">Тема задания<input className={field} value={topic} onChange={e => setTopic(e.target.value)} minLength={1} maxLength={200} required /></label>
      <label className="block">Сложность<select className={field} value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="easy">Простое</option><option value="medium">Среднее</option><option value="hard">Сложное</option></select></label>
      <label className="block">Пожелания нейросети<textarea className={field} value={hint} onChange={e => setHint(e.target.value)} maxLength={1000} placeholder="Например: 8 класс, ошибки раскрытия скобок и переноса слагаемых" /></label>
      <button className={btn} disabled={busy}>{busy ? 'Нейросеть готовит черновик…' : 'Создать черновик с нейросетью'}</button>
    </form>}
    <ul className="space-y-3">{rows.map(t => <li key={t.id}><button className="w-full rounded-xl border border-paper-50/15 p-5 text-left" onClick={() => setEditing(t)}><span className="font-serif text-xl">{t.title}</span><span className="ml-3 text-xs text-gold-500">{t.status === 'published' ? 'опубликовано' : 'черновик'}</span><p className="mt-2 text-sm text-paper-50/60">{t.topic} · открыть задание и ответы учеников</p></button></li>)}</ul>
    {!rows.length && <p className="text-sm text-paper-50/50">Пока нет заданий.</p>}
  </div>
}

function SolutionEditor({ task, token, onSaved, onBack }: { task: SolutionTask | null; token: string; onSaved: (t: SolutionTask) => void; onBack: () => void }) {
  const [draft, setDraft] = useState<ExerciseInput>(task ?? blank())
  const [dirty, setDirty] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const published = task?.status === 'published'
  function update(patch: Partial<ExerciseInput>) { setDraft(prev => ({ ...prev, ...patch })); setDirty(true); setReviewed(false) }
  async function action(fn: () => Promise<SolutionTask>) { setBusy(true); setError(''); try { onSaved(await fn()) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <div className="space-y-6">
    <button className={btn} disabled={busy} onClick={() => { if (!dirty || confirm('Выйти без сохранения изменений?')) onBack() }}>Назад к заданиям</button>
    <h2 className="font-serif text-2xl">{task ? task.title : 'Новое задание «Проверь решение»'}</h2>
    <p className="text-sm text-paper-50/65">Перед публикацией проверьте математику: нейросеть может ошибиться. В текстах четырёх решений не должно быть подсказок. Эталонные пояснения скрыты до сдачи ответа.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {task && <div className="rounded-xl border border-paper-50/20 p-4 space-y-4" aria-label="Управление заданием">
      <p className="text-sm text-gold-500">{published ? 'Опубликовано — доступно ученикам' : 'Черновик — скрыто от учеников'}</p>
    {task && (published ? <button className={btn} disabled={busy} onClick={() => action(() => api.unpublish(token, task.id))}>Снять с публикации</button> : <div className="space-y-3"><label className="flex gap-3 items-start text-sm"><input type="checkbox" checked={reviewed} disabled={dirty || busy} onChange={e => setReviewed(e.target.checked)} />Я проверил(а): одно решение правильное, три неверных, эталонные пояснения корректны.</label><button className={btn} disabled={!reviewed || dirty || busy} onClick={() => action(() => api.publish(token, task.id))}>Опубликовать задание</button>{dirty && <p className="text-xs text-paper-50/50">Сначала сохраните изменения.</p>}</div>)}
    {published && <p className="text-sm text-paper-50/60">Для правки верните задание в черновик. Сданные ответы сохранят свою версию задания; новая публикация не сбрасывает попытки.</p>}
      <button className={`${btn} text-red-300`} disabled={busy} onClick={async () => {
        if (busy || !confirm(`Вы хотите удалить задание «${task.title}» вместе с ответами учеников и оценками? Это действие нельзя отменить.`)) return
        setBusy(true); setError('')
        try { await api.delete(token, task.id); onBack() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
      }}>Удалить задание</button>
    </div>}
    <form onSubmit={e => { e.preventDefault(); void action(() => api.save(token, draft, task?.id)) }} className="space-y-5">
      <fieldset disabled={published || busy} className="space-y-4">
        <label className="block">Название<input className={field} value={draft.title} onChange={e => update({ title: e.target.value })} minLength={3} maxLength={200} required /></label>
        <label className="block">Тема<input className={field} value={draft.topic} onChange={e => update({ topic: e.target.value })} minLength={1} maxLength={200} required /></label>
        <label className="block">Условие<textarea className={field} value={draft.question_md} onChange={e => update({ question_md: e.target.value })} minLength={5} maxLength={5000} required /></label>
        {draft.solutions.map((s, i) => <fieldset key={s.id} className="rounded-xl border border-paper-50/15 p-4 space-y-3"><legend className="px-2">Решение {i + 1}</legend>
          <label className="flex items-center gap-2"><input type="radio" name="teacher-correct" checked={s.is_correct} onChange={() => update({ solutions: draft.solutions.map(x => ({ ...x, is_correct: x.id === s.id })) })} />Правильное решение {i + 1}</label>
          <label className="block">Текст решения {i + 1}<textarea className={`${field} min-h-36`} value={s.body_md} onChange={e => update({ solutions: draft.solutions.map(x => x.id === s.id ? { ...x, body_md: e.target.value } : x) })} minLength={5} maxLength={4000} required /></label>
          <label className="block text-sm text-gold-500">Эталонное пояснение {i + 1}<textarea className={`${field} min-h-28`} value={s.error_explanation ?? ''} onChange={e => update({ solutions: draft.solutions.map(x => x.id === s.id ? { ...x, error_explanation: e.target.value } : x) })} minLength={5} maxLength={2000} required placeholder="Для неверного решения: ошибочный шаг, почему он неверен и как исправить. Для верного: объяснение правильности." /></label>
        </fieldset>)}
      </fieldset>
      {!published && <button className={btn} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить черновик'}</button>}
    </form>
    <button className={btn} onClick={() => setPreview(!preview)} aria-expanded={preview}>{preview ? 'Скрыть предпросмотр' : 'Предпросмотр задания'}</button>
    {preview && <div className="rounded-xl border border-paper-50/15 p-5 space-y-5"><Markdown text={draft.question_md} />{draft.solutions.map((s, i) => <div key={s.id}><p className="text-xs text-paper-50/60">Решение {i + 1}</p><Markdown text={s.body_md} /></div>)}</div>}
    {task && <TeacherAttempts token={token} taskId={task.id} />}
  </div>
}

function TeacherAttempts({ token, taskId }: { token: string; taskId: string }) {
  const [rows, setRows] = useState<SolutionAttempt[]>([])
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      try {
        const data = await api.attempts(token, taskId)
        if (!alive) return
        setRows(data); setError('')
        if (data.some(a => ['queued', 'checking'].includes(a.status))) timer = setTimeout(load, 4000)
      } catch (e) { if (alive) setError((e as Error).message) }
    }
    void load()
    return () => { alive = false; clearTimeout(timer) }
  }, [token, taskId, refresh])
  return <section className="space-y-4 border-t border-paper-50/15 pt-6"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-serif text-xl">Ответы учеников · {rows.length}</h3><button className={btn} onClick={() => setRefresh(n => n + 1)}>Обновить ответы</button></div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!rows.length && <p className="text-sm text-paper-50/50">Пока никто не ответил.</p>}
    {rows.map(row => <TeacherAttempt key={row.id} row={row} token={token} onSaved={() => setRefresh(n => n + 1)} />)}
  </section>
}

function TeacherAttempt({ row, token, onSaved }: { row: SolutionAttempt; token: string; onSaved: () => void }) {
  const [score, setScore] = useState(row.teacher_result?.score ?? row.ai_result?.score ?? 0)
  const [feedback, setFeedback] = useState(row.teacher_result?.feedback ?? '')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function act(fn: () => Promise<unknown>) { setBusy(true); setError(''); try { await fn(); setEditing(false); onSaved() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <div className="rounded-xl border border-paper-50/10 p-4 space-y-3">
    <p className="text-paper-50">{row.student_name} · {row.class_label}</p><SolutionAttemptCard attempt={row} />
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="flex flex-wrap gap-3"><button className={btn} disabled={busy} onClick={() => { setScore(row.teacher_result?.score ?? row.ai_result?.score ?? 0); setEditing(!editing) }}>Оценить вручную</button>{row.status === 'failed' && <button className={btn} disabled={busy} onClick={() => act(() => api.retry(token, row.id))}>Повторить проверку ИИ</button>}</div>
    {editing && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act(() => api.grade(token, row.id, { score, feedback })) }}><label className="block">Баллы учителя (0–7)<input className={field} type="number" min={0} max={7} step={1} required value={score} onChange={e => setScore(Number(e.target.value))} /></label><label className="block">Комментарий учителя<textarea className={field} minLength={3} maxLength={3000} required value={feedback} onChange={e => setFeedback(e.target.value)} /></label><p className="text-xs text-paper-50/50">Исходная проверка нейросети сохранится. Ученик увидит вашу оценку и комментарий.</p><button className={btn} disabled={busy}>Сохранить оценку учителя</button></form>}
  </div>
}
