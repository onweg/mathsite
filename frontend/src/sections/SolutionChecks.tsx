import { useEffect, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { SolutionAttemptCard } from '../components/SolutionAttempt'
import { SolutionTask, SolutionSummary, SolutionAttempt, solutionChecks } from '../lib/solutionChecks'
import { useStudent } from '../lib/student'

const button = 'rounded-lg border border-gold-500/40 px-4 py-2 text-sm text-gold-500 disabled:opacity-40'

export function SolutionChecks() {
  const auth = useStudent()
  const [rows, setRows] = useState<SolutionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState<SolutionTask | null>(null)
  const [result, setResult] = useState<SolutionAttempt | null>(null)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(false)
  useEffect(() => {
    let alive = true
    solutionChecks.list().then(data => { if (alive) setRows(data) }).catch(e => { if (alive) setError(e.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [auth.status])
  useEffect(() => {
    if (!result || !['queued', 'checking'].includes(result.status)) return
    let alive = true
    const timer = setTimeout(() => {
      solutionChecks.attempt(result.id).then(row => { if (alive) { setResult(row); setError('') } }).catch(e => { if (alive) { setError(e.message); setResult({ ...result }) } })
    }, 3000)
    return () => { alive = false; clearTimeout(timer) }
  }, [result])

  async function open(id: string) {
    setOpening(true); setError('')
    try { setTask(await solutionChecks.get(id)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось открыть задание') }
    finally { setOpening(false) }
  }

  return <section id="solution-checks" aria-label="Проверь решение" className="scroll-mt-24 border-y border-paper-50/10 bg-ink-950 px-6 py-24 md:px-10">
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="space-y-4"><p className="text-xs uppercase tracking-widest text-gold-500">Четыре решения · одна верная идея</p><h2 className="font-display text-4xl md:text-6xl">Проверь решение</h2><p className="max-w-2xl text-paper-50/65">Выбери правильное решение и объясни ошибки в трёх остальных. Нейросеть проверит объяснения и даст обратную связь. Одна попытка: проверь текст перед отправкой.</p></header>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {auth.status !== 'authed' && <p className="text-paper-50/70">Для ответа нужен личный QR-код учителя. <a href="/me" className="text-gold-500 underline">Вход ученика</a></p>}
      {result ? <><SolutionAttemptCard attempt={result} initiallyOpen /><div className="flex gap-4"><a href="/me" className={button}>Моя история</a><button className={button} onClick={() => { setResult(null); setTask(null) }}>К заданиям</button></div></> : task ?
        <SolutionRunner key={task.id} task={task} onCancel={() => setTask(null)} onDone={row => { setResult(row); setRows(prev => prev.map(t => t.id === task.id ? { ...t, attempted: true } : t)) }} /> :
        <div className="grid gap-4 md:grid-cols-2">
          {loading && <p>Загрузка…</p>}
          {!loading && !rows.length && <p className="text-paper-50/60">Учитель пока не опубликовал задания.</p>}
          {rows.map(row => <article key={row.id} className="rounded-2xl border border-paper-50/15 p-6 space-y-3"><h3 className="font-serif text-2xl">{row.title}</h3><p className="text-sm text-paper-50/60">{row.topic}</p>{row.attempted ? <a href="/me" className={button}>Ответ отправлен · история</a> : <button className={button} disabled={auth.status !== 'authed' || opening} onClick={() => open(row.id)}>Открыть задание</button>}</article>)}
        </div>}
    </div>
  </section>
}

function SolutionRunner({ task, onCancel, onDone }: { task: SolutionTask; onCancel: () => void; onDone: (a: SolutionAttempt) => void }) {
  const [selected, setSelected] = useState('')
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!selected || task.solutions.some(s => s.id !== selected && !texts[s.id]?.trim())) { setError('Выбери решение и заполни три объяснения.'); return }
    if (!confirm('Отправить ответ на проверку? Изменить его после отправки нельзя.')) return
    setBusy(true); setError('')
    try {
      const explanations = Object.fromEntries(task.solutions.filter(s => s.id !== selected).map(s => [s.id, texts[s.id]]))
      onDone(await solutionChecks.submit(task.id, { revision: task.revision, selected_id: selected, solution_order: task.solutions.map(s => s.id), explanations }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отправить ответ') }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="space-y-6">
    <h3 className="font-serif text-2xl">{task.title}</h3><Markdown text={task.question_md} />
    <p className="text-sm text-paper-50/60">1 балл за выбор, до 2 баллов за объяснение каждой ошибки. Максимум — 7.</p>
    <fieldset disabled={busy} className="space-y-4"><legend className="mb-3">Какое решение правильное?</legend>
      {task.solutions.map((s, i) => <div key={s.id} className="rounded-xl border border-paper-50/15 p-5 space-y-4">
        <label className="flex items-center gap-3 text-gold-500"><input type="radio" name="correct-solution" value={s.id} checked={selected === s.id} onChange={() => setSelected(s.id)} required />Решение {i + 1}</label>
        <Markdown text={s.body_md} />
        {selected && selected !== s.id && <label className="block text-sm text-paper-50/70">Ошибка в решении {i + 1}<textarea className="mt-2 block min-h-28 w-full rounded-lg border border-paper-50/20 bg-ink-950 p-3 text-paper-50" value={texts[s.id] ?? ''} onChange={e => setTexts(prev => ({ ...prev, [s.id]: e.target.value }))} maxLength={2000} required placeholder="Укажи ошибочный шаг, объясни правило или исправление." /></label>}
      </div>)}
    </fieldset>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="flex flex-wrap gap-3"><button className={button} type="submit" disabled={busy}>{busy ? 'Сохраняем ответ…' : 'Отправить на проверку'}</button><button className={button} type="button" disabled={busy} onClick={onCancel}>К заданиям</button></div>
  </form>
}
