import { useEffect, useState } from 'react'
import {
  StudentAttemptDTO,
  AttemptReviewDTO,
  StudentPollAnswerDTO,
  StudentWeeklyDTO,
  fileUrl,
  studentAuth,
} from '../../lib/api'
import { Markdown } from '../../components/Markdown'
import { useStudent } from '../../lib/student'

export function StudentProfile() {
  // На главной body { cursor: none } — на профиле ученика пусть системный.
  useEffect(() => {
    const prev = document.body.style.cursor
    document.body.style.cursor = 'auto'
    return () => {
      document.body.style.cursor = prev
    }
  }, [])

  const auth = useStudent()
  const [attempts, setAttempts] = useState<StudentAttemptDTO[] | null>(null)
  const [weekly, setWeekly] = useState<StudentWeeklyDTO[] | null>(null)
  const [polls, setPolls] = useState<StudentPollAnswerDTO[] | null>(null)

  useEffect(() => {
    if (auth.status !== 'authed') return
    studentAuth
      .myAttempts()
      .then(setAttempts)
      .catch(() => setAttempts([]))
    studentAuth
      .myWeekly()
      .then(setWeekly)
      .catch(() => setWeekly([]))
    studentAuth
      .myPolls()
      .then(setPolls)
      .catch(() => setPolls([]))
  }, [auth.status])

  useEffect(() => {
    if (auth.status !== 'authed') return
    let alive = true
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      studentAuth.myAttempts().then(rows => { if (alive) setAttempts(rows) }).catch(() => {})
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      alive = false
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [auth.status])

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen bg-ink-950 text-paper-50/50 flex items-center justify-center text-sm">
        загрузка…
      </div>
    )
  }

  if (auth.status === 'anon') {
    return (
      <div className="min-h-screen bg-ink-950 text-paper-50 flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="font-display text-4xl text-paper-50/90">—</div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper-50/50">
            Вход только по QR
          </div>
          <p className="text-paper-50/70">
            Отсканируй персональный QR от учителя, чтобы попасть в профиль.
          </p>
          <a
            href="/"
            className="inline-block text-xs text-paper-50/60 hover:text-paper-50 border border-paper-50/15 rounded-full px-4 py-2"
          >
            Назад на сайт
          </a>
        </div>
      </div>
    )
  }

  const { student } = auth
  const total = attempts?.length ?? 0
  const avg =
    attempts && attempts.length
      ? attempts.reduce((s, a) => s + a.score / Math.max(1, a.total), 0) / attempts.length
      : 0

  return (
    <div className="min-h-screen bg-ink-950 text-paper-50">
      <header className="border-b border-paper-50/10 px-6 py-4 flex items-center justify-between">
        <a href="/" className="text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1">
          Назад на сайт
        </a>
        <button
          onClick={auth.signOut}
          className="text-sm text-paper-50/70 hover:text-paper-50 border border-paper-50/20 rounded px-3 py-1.5"
        >
          выйти
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-14 space-y-10">
        <div className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-paper-50/50">
            Профиль ученика
          </div>
          <h1 className="font-display text-5xl text-paper-50">{student.name}</h1>
          <div className="text-paper-50/60">{student.class_label || 'без класса'}</div>
        </div>

        <section className="rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-widest text-paper-50/60">Мои тесты</h2>
            {attempts && attempts.length > 0 && (
              <div className="font-mono text-xs text-paper-50/60">
                {total} попыток · средний {Math.round(avg * 100)}%
              </div>
            )}
          </div>

          {attempts === null ? (
            <div className="text-paper-50/50 text-sm">загрузка…</div>
          ) : attempts.length === 0 ? (
            <p className="text-paper-50/60 text-sm">
              Пока попыток нет. Пройди тест на главной — результат появится здесь.
            </p>
          ) : (
            <ul className="divide-y divide-paper-50/5">
              {attempts.map((a) => (
                <AttemptRow key={a.id} attempt={a} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-widest text-paper-50/60">
              Задача недели
            </h2>
            {weekly && weekly.length > 0 && (
              <div className="font-mono text-xs text-paper-50/60">
                решено {weekly.filter((w) => w.status === 'correct').length} из{' '}
                {weekly.length}
              </div>
            )}
          </div>

          {weekly === null ? (
            <div className="text-paper-50/50 text-sm">загрузка…</div>
          ) : weekly.length === 0 ? (
            <p className="text-paper-50/60 text-sm">
              Ты ещё не присылал решений. Задача недели — на главной, решение
              можно отправить текстом или фотографией тетради.
            </p>
          ) : (
            <ul className="divide-y divide-paper-50/5">
              {weekly.map((w) => (
                <WeeklyRow key={w.id} item={w} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6 space-y-4">
          <h2 className="text-sm uppercase tracking-widest text-paper-50/60">
            Моя обратная связь
          </h2>

          {polls === null ? (
            <div className="text-paper-50/50 text-sm">загрузка…</div>
          ) : polls.length === 0 ? (
            <p className="text-paper-50/60 text-sm">
              Пока ничего не отвечал. Опросы появляются на главной, когда
              учитель их открывает.
            </p>
          ) : (
            <ul className="divide-y divide-paper-50/5">
              {polls.map((p) => (
                <li key={p.id} className="py-3 space-y-2">
                  <div className="text-paper-50">{p.poll_title}</div>
                  {p.chosen.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {p.chosen.map((t, i) => (
                        <li
                          key={i}
                          className="rounded-full border border-sage-500/30 bg-sage-500/5 px-3 py-1 text-xs text-paper-100/85"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.comment && (
                    <p className="text-sm leading-relaxed text-paper-100/70">
                      {p.comment}
                    </p>
                  )}
                  <div className="text-[11px] text-paper-50/40">
                    {formatDate(p.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-paper-50/40">
          <a href="/#quizzes" className="hover:text-paper-50/70">
            На главную, к заданиям
          </a>
          <a href="/#weekly" className="hover:text-paper-50/70">
            К задаче недели
          </a>
        </div>
        <p className="text-center text-[11px] leading-relaxed text-paper-50/30">
          На главной показывается только то, что ты ещё не проходил. Всё
          сделанное собирается здесь.
        </p>
      </main>
    </div>
  )
}

const WEEKLY_STATUS: Record<
  StudentWeeklyDTO['status'],
  { label: string; className: string }
> = {
  new: { label: 'на проверке', className: 'text-amber-300/90' },
  correct: { label: 'верно', className: 'text-emerald-300' },
  partial: { label: 'почти', className: 'text-sky-300' },
  wrong: { label: 'пока неверно', className: 'text-red-300/90' },
}

function WeeklyRow({ item }: { item: StudentWeeklyDTO }) {
  const [open, setOpen] = useState(false)
  const st = WEEKLY_STATUS[item.status]

  return (
    <li className="py-3 space-y-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-paper-50 truncate">{item.task_title}</div>
          <div className="text-[11px] text-paper-50/40 mt-0.5">
            {formatDate(item.created_at)}
          </div>
        </div>
        <span className={`font-mono text-xs shrink-0 ${st.className}`}>
          {st.label}
        </span>
      </button>

      {open && (
        <div className="space-y-3 pl-1">
          {item.solution_md && (
            <div className="text-sm leading-relaxed text-paper-100/75">
              <Markdown text={item.solution_md} />
            </div>
          )}
          {item.image_url && (
            // высота коробки задана заранее — иначе список прыгает,
            // когда фото догрузится
            <div className="h-56">
              <img
                src={fileUrl(item.image_url)}
                alt={`Решение: ${item.task_title}`}
                className="h-full w-auto max-w-full rounded-xl border border-paper-50/10 object-contain"
              />
            </div>
          )}
          {item.teacher_comment && (
            <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500/80">
                учитель
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-paper-100/85">
                {item.teacher_comment}
              </p>
            </div>
          )}
          {!item.solution_md && !item.image_url && !item.teacher_comment && (
            <p className="text-sm text-paper-50/40">Нечего показать.</p>
          )}
        </div>
      )}
    </li>
  )
}

function AttemptRow({ attempt }: { attempt: StudentAttemptDTO }) {
  const [open, setOpen] = useState(false)
  const [review, setReview] = useState<AttemptReviewDTO | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (review) return
    setBusy(true)
    setError(null)
    try { setReview(await studentAuth.attemptReview(attempt.id)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить разбор') }
    finally { setBusy(false) }
  }

  return <li className="py-4 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-paper-50 break-words">{attempt.quiz_title}</div>
        <div className="mt-1 text-[11px] text-paper-50/40">{formatDate(attempt.created_at)}</div>
      </div>
      <ScoreBadge score={attempt.score} total={attempt.total} />
    </div>
    {attempt.answers_available ? <button onClick={toggle} disabled={busy} aria-expanded={open} className="rounded-lg border border-gold-500/40 px-3 py-2 text-sm text-gold-500 disabled:opacity-50">{open ? 'Скрыть разбор' : 'Посмотреть ответы и разбор'}</button> : <p className="text-xs text-paper-50/50">Правильные ответы появятся, когда учитель завершит тест.</p>}
    {open && <div className="space-y-4">
      {busy && <p className="text-sm text-paper-50/50">Загружаем разбор…</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {review?.legacy && <p className="text-sm text-amber-200/80">Архивная попытка: разбор по сохранённым ответам и текущей версии вопросов. Исходная оценка не пересчитывается. Удалённые вопросы восстановить нельзя.</p>}
      {review && review.items.length < review.total && <p className="text-sm text-paper-50/60">Часть старых вопросов не сохранилась. Доступно вопросов: {review.items.length} из {review.total}.</p>}
      {review?.items.map(item => <article key={item.item_id} className="rounded-xl border border-paper-50/10 bg-ink-950/50 p-4 space-y-3">
        <div className="flex justify-between gap-3 text-sm"><span>Вопрос {item.position}</span><span className={item.correct ? 'text-emerald-300' : 'text-red-300'}>{item.correct ? 'Верно' : 'Ошибка'}</span></div>
        <Markdown text={item.question_md} />
        <div><p className="mb-1 text-xs text-paper-50/50">Твой ответ</p><Markdown text={item.got || 'Ответ не дан'} /></div>
        <div className="border-l-2 border-emerald-500/50 pl-3"><p className="mb-1 text-xs text-emerald-300">Правильный ответ</p><Markdown text={item.expected} /></div>
        {item.explanation && <div><p className="mb-1 text-xs text-paper-50/50">Объяснение</p><Markdown text={item.explanation} /></div>}
      </article>)}
    </div>}
  </li>
}

function ScoreBadge({ score, total }: { score: number; total: number }) {
  const pct = total ? score / total : 0
  const color =
    pct >= 0.8 ? 'text-emerald-300' : pct >= 0.5 ? 'text-amber-300' : 'text-red-300'
  return (
    <span className={`font-mono text-sm shrink-0 ${color}`}>
      {score} / {total}
    </span>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
