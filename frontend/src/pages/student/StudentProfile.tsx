import { useEffect, useState } from 'react'
import { StudentAttemptDTO, studentAuth } from '../../lib/api'
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

  useEffect(() => {
    if (auth.status !== 'authed') return
    studentAuth
      .myAttempts()
      .then(setAttempts)
      .catch(() => setAttempts([]))
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
            <h2 className="text-sm uppercase tracking-widest text-paper-50/60">Мои квизы</h2>
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
              Пока попыток нет. Пройди квиз на главной — результат появится здесь.
            </p>
          ) : (
            <ul className="divide-y divide-paper-50/5">
              {attempts.map((a) => (
                <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-paper-50 truncate">{a.quiz_title}</div>
                    <div className="text-[11px] text-paper-50/40 mt-0.5">
                      {formatDate(a.created_at)}
                    </div>
                  </div>
                  <ScoreBadge score={a.score} total={a.total} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="text-center text-xs text-paper-50/40">
          <a href="/#quizzes" className="hover:text-paper-50/70">
            Пройти ещё квиз
          </a>
        </div>
      </main>
    </div>
  )
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
