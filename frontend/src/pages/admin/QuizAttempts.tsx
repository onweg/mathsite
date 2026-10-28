import { useEffect, useState } from 'react'
import { AttemptSummaryDTO, QuizAttemptsSummaryDTO, adminQuizzes } from '../../lib/api'

export function QuizAttempts({ token, quizId }: { token: string; quizId: string }) {
  const [data, setData] = useState<{
    attempts: AttemptSummaryDTO[]
    summary: QuizAttemptsSummaryDTO
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    setLoading(true)
    Promise.all([
      adminQuizzes.listAttempts(token, quizId),
      adminQuizzes.attemptsSummary(token, quizId),
    ])
      .then(([attempts, summary]) => {
        if (!cancelled) setData({ attempts, summary })
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'ошибка загрузки')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [token, quizId, revision])

  const attempts = data?.attempts ?? []
  const summary = data?.summary

  return (
    <section className="rounded-2xl border border-paper-50/10 bg-ink-900/30 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-widest text-paper-50/60">Прохождения</h3>
        <button
          onClick={() => setRevision((value) => value + 1)}
          disabled={loading}
          className="text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1 disabled:opacity-40"
        >
          обновить
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-paper-50/50 text-sm">загрузка…</div>
      ) : !summary ? null : summary.total_attempts === 0 ? (
        <div className="text-paper-50/50 text-sm py-4">
          пока никто не проходил этот тест.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="всего попыток" value={String(summary.total_attempts)} />
            <Stat label="учеников по QR" value={String(summary.students.length)} />
          </div>

          {summary.students.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Попытки прохождения теста по ученикам</caption>
                <thead className="text-[11px] uppercase tracking-wider text-paper-50/40">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-normal">Ученик</th>
                    <th scope="col" className="py-2 px-3 text-center font-normal">Попыток</th>
                    <th scope="col" className="py-2 pl-4 text-right font-normal">Последний результат</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-50/5">
                  {summary.students.map((student) => (
                    <tr key={student.student_id}>
                      <th scope="row" className="py-3 pr-4 font-normal">
                        <div className="text-paper-50">{student.student_name}</div>
                        {student.class_label && (
                          <div className="text-[11px] text-paper-50/40">{student.class_label}</div>
                        )}
                      </th>
                      <td className="py-3 px-3 text-center font-mono text-gold-500">
                        {student.attempts_count}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <ScoreBadge score={student.last_score} total={student.last_total} />
                        <div className="text-[11px] text-paper-50/40 mt-0.5">
                          {formatDate(student.last_attempt_at)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {summary.anonymous_attempts > 0 && (
            <p className="text-xs text-paper-50/50">
              Попыток без привязки к ученику: {summary.anonymous_attempts}.
              {' '}Они включены в общее число; определить количество попыток каждого ученика по ним нельзя.
            </p>
          )}

          <details>
            <summary className="cursor-pointer text-sm text-paper-50/60 hover:text-paper-50">
              История прохождений
              {summary.total_attempts > attempts.length && ` · последние ${attempts.length}`}
            </summary>
            <p className="text-xs text-paper-50/40 mt-3">
              Средний балл по показанным прохождениям:{' '}
              {attempts.length
                ? `${Math.round(attempts.reduce((sum, a) => sum + a.score / Math.max(1, a.total), 0) / attempts.length * 100)}%`
                : '—'}
            </p>
            <ul className="divide-y divide-paper-50/5 pt-2">
              {attempts.map((a) => (
                <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-paper-50 truncate flex items-center gap-2">
                      {a.student_name}
                      {a.student_id ? (
                        <span
                          title="вошёл по персональной QR-ссылке"
                          className="text-[9px] font-mono uppercase tracking-widest text-emerald-300/80 border border-emerald-500/30 rounded px-1.5 py-0.5"
                        >
                          QR
                        </span>
                      ) : (
                        <span
                          title="прошёл анонимно, имя указал сам"
                          className="text-[9px] font-mono uppercase tracking-widest text-paper-50/40 border border-paper-50/10 rounded px-1.5 py-0.5"
                        >
                          anon
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-paper-50/40 mt-0.5">
                      {formatDate(a.created_at)}
                    </div>
                  </div>
                  <ScoreBadge score={a.score} total={a.total} />
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-paper-50/5 bg-ink-950/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-paper-50/40">{label}</div>
      <div className="text-paper-50 text-lg font-mono mt-0.5">{value}</div>
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
