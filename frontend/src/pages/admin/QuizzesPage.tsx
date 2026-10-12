import { useEffect, useState } from 'react'
import { QuizDTO, QuizSummaryDTO, adminQuizzes } from '../../lib/api'
import { QuizEditor } from './QuizEditor'
import { QuizGenerateForm } from './QuizGenerateForm'

type View =
  | { mode: 'list' }
  | { mode: 'generate' }
  | { mode: 'edit'; quizId: string }

export function QuizzesPage({ token }: { token: string }) {
  const [view, setView] = useState<View>({ mode: 'list' })
  const [quizzes, setQuizzes] = useState<QuizSummaryDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    try {
      setQuizzes(await adminQuizzes.list(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка загрузки')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  if (view.mode === 'generate') {
    return (
      <QuizGenerateForm
        token={token}
        onCancel={() => setView({ mode: 'list' })}
        onDone={(q: QuizDTO) => {
          reload()
          setView({ mode: 'edit', quizId: q.id })
        }}
      />
    )
  }

  if (view.mode === 'edit') {
    return (
      <QuizEditor
        token={token}
        quizId={view.quizId}
        onBack={() => {
          reload()
          setView({ mode: 'list' })
        }}
        onDeleted={() => {
          reload()
          setView({ mode: 'list' })
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg text-paper-50 font-serif">Квизы</h2>
        <button
          onClick={() => setView({ mode: 'generate' })}
          className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium"
        >
          + сгенерировать
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {quizzes === null ? (
        <div className="text-paper-50/50 text-sm">загрузка…</div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-50/15 p-8 text-center text-paper-50/50">
          пока нет ни одного квиза. нажми «сгенерировать» чтобы создать первый.
        </div>
      ) : (
        <ul className="space-y-2">
          {quizzes.map((q) => (
            <li key={q.id}>
              <button
                onClick={() => setView({ mode: 'edit', quizId: q.id })}
                className="w-full text-left rounded-xl border border-paper-50/10 bg-ink-900/30 hover:bg-ink-900/60 transition p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-paper-50 truncate">{q.title}</div>
                  <div className="text-xs text-paper-50/50 mt-0.5">
                    {q.topic} · {q.difficulty} · {q.items_count} вопросов
                  </div>
                </div>
                <StatusBadge status={q.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  if (status === 'published')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        опубликован
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-300/80 shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      черновик
    </span>
  )
}
