import { useEffect, useState } from 'react'
import { AttemptSummaryDTO, adminQuizzes } from '../../lib/api'

export function QuizAttempts({ token, quizId }: { token: string; quizId: string }) {
  const [attempts, setAttempts] = useState<AttemptSummaryDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    try {
      setAttempts(await adminQuizzes.listAttempts(token, quizId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка загрузки')
    }
  }

  useEffect(() => {
    reload()
  }, [quizId])

  const total = attempts?.length ?? 0
  const avg = attempts && attempts.length
    ? attempts.reduce((s, a) => s + a.score / Math.max(1, a.total), 0) / attempts.length
    : 0

  return (
    <section className="rounded-2xl border border-paper-50/10 bg-ink-900/30 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-widest text-paper-50/60">Прохождения</h3>
        <button
          onClick={reload}
          className="text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1"
        >
          обновить
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {attempts === null ? (
        <div className="text-paper-50/50 text-sm">загрузка…</div>
      ) : attempts.length === 0 ? (
        <div className="text-paper-50/50 text-sm py-4">
          пока никто не проходил этот квиз.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="всего попыток" value={String(total)} />
            <Stat label="средний балл" value={`${Math.round(avg * 100)}%`} />
          </div>

          <ul className="divide-y divide-paper-50/5 pt-2">
            {attempts.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-paper-50 truncate">{a.student_name}</div>
                  <div className="text-[11px] text-paper-50/40 mt-0.5">
                    {formatDate(a.created_at)}
                  </div>
                </div>
                <ScoreBadge score={a.score} total={a.total} />
              </li>
            ))}
          </ul>
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
