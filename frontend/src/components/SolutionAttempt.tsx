import { useEffect, useState } from 'react'
import { SolutionAttempt, solutionChecks } from '../lib/solutionChecks'
import { Markdown } from './Markdown'

export const solutionStatus = { queued: 'Ожидает проверки', checking: 'Нейросеть проверяет', graded: 'Проверено нейросетью', failed: 'Нужна помощь учителя' }

export function SolutionAttemptCard({ attempt, initiallyOpen = false }: { attempt: SolutionAttempt; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  const result = attempt.teacher_result ?? attempt.ai_result
  return <article className="rounded-xl border border-paper-50/15 p-4 space-y-3 min-w-0 break-words">
    <div className="flex flex-wrap justify-between gap-3">
      <h3 className="font-serif text-xl">{attempt.title}</h3>
      {result && <span className="font-mono text-gold-500">{result.score} / 7</span>}
    </div>
    <p role="status" className="text-sm text-gold-500">{attempt.teacher_result ? 'Проверено учителем' : solutionStatus[attempt.status]}</p>
    <p className="text-xs text-paper-50/45">{new Date(attempt.created_at).toLocaleString('ru-RU')}</p>
    {(attempt.status === 'queued' || attempt.status === 'checking') && <p className="text-sm text-paper-50/65">Ответ сохранён. Можно закрыть страницу — результат появится в профиле. При временном сбое проверка повторится автоматически.</p>}
    {attempt.status === 'failed' && <p className="text-sm text-paper-50/65">Не удалось завершить автоматическую проверку. Ответ сохранён, балл не выставлен. Учитель сможет проверить его или повторить запрос.</p>}
    {attempt.teacher_result && <div className="rounded-lg bg-sage-500/10 p-3"><Markdown text={attempt.teacher_result.feedback} /></div>}
    <button className="text-sm text-gold-500 underline" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Скрыть ответы' : 'Мои ответы и обратная связь'}</button>
    {open && <div className="space-y-4">
      <Markdown text={attempt.question_md} />
      {attempt.ai_result && <p className="text-sm text-paper-50/65">{attempt.teacher_result ? `Первоначальная проверка нейросетью: ${attempt.ai_result.score} / 7. ` : ''}Выбор решения: {attempt.ai_result.choice_correct ? 'верно' : 'неверно'} ({attempt.ai_result.choice_points} / 1). Объяснения ошибок — до 2 баллов за каждое.</p>}
      {attempt.solutions.map((s, i) => {
        const item = attempt.ai_result?.items.find(g => g.solution_id === s.id)
        return <div key={s.id} className="rounded-lg border border-paper-50/10 p-4 space-y-2">
          <p className="text-xs text-paper-50/60">Решение {i + 1}{attempt.answer.selected_id === s.id ? ' · твой выбор' : ''}{s.is_correct === true ? ' · правильное' : ''}</p>
          <Markdown text={s.body_md} />
          {attempt.answer.explanations[s.id] && <div><p className="text-xs text-paper-50/50">Твоё объяснение</p><Markdown text={attempt.answer.explanations[s.id]} /></div>}
          {item && <div className="border-l-2 border-gold-500/60 pl-3"><p className="text-xs text-gold-500">Обратная связь нейросети{item.points !== null ? ` · ${item.points} / 2` : ''}</p><Markdown text={item.feedback} /></div>}
          {s.error_explanation && <div><p className="text-xs text-sage-300">Разбор задания</p><Markdown text={s.error_explanation} /></div>}
        </div>
      })}
    </div>}
  </article>
}

export function SolutionHistory() {
  const [rows, setRows] = useState<SolutionAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    let running = false
    async function load() {
      if (running) return
      running = true
      clearTimeout(timer)
      try {
        const next = await solutionChecks.history()
        if (!alive) return
        setRows(next); setError('')
        if (next.some(a => ['queued', 'checking'].includes(a.status))) timer = setTimeout(load, 4000)
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Не удалось загрузить историю') }
      finally { running = false; if (alive) setLoading(false) }
    }
    void load()
    window.addEventListener('focus', load)
    return () => { alive = false; clearTimeout(timer); window.removeEventListener('focus', load) }
  }, [])
  return <section className="rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6 space-y-4">
    <h2 className="text-sm uppercase tracking-widest text-paper-50/60">Проверь решение</h2>
    {loading && <p>Загрузка…</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!loading && !error && !rows.length && <p className="text-sm text-paper-50/60">Здесь появятся ответы и проверки заданий из раздела <a href="/#solution-checks" className="text-gold-500 underline">«Проверь решение»</a>.</p>}
    {rows.map(row => <SolutionAttemptCard key={row.id} attempt={row} />)}
  </section>
}
