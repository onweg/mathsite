import { useEffect, useState } from 'react'
import { QuizDTO, adminQuizzes } from '../../lib/api'
import { QuizAttempts } from './QuizAttempts'
import { QuizItemCard } from './QuizItemCard'

export function QuizEditor({
  token,
  quizId,
  onBack,
  onDeleted,
}: {
  token: string
  quizId: string
  onBack: () => void
  onDeleted: () => void
}) {
  const [quiz, setQuiz] = useState<QuizDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    try {
      setQuiz(await adminQuizzes.get(token, quizId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка загрузки')
    }
  }

  useEffect(() => {
    reload()
  }, [quizId])

  async function publish() {
    if (!quiz) return
    setBusy(true)
    try {
      setQuiz(await adminQuizzes.publish(token, quiz.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка публикации')
    } finally {
      setBusy(false)
    }
  }

  async function unpublish() {
    if (!quiz) return
    setBusy(true)
    try {
      setQuiz(await adminQuizzes.unpublish(token, quiz.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка снятия')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!quiz) return
    if (!confirm(`Удалить квиз «${quiz.title}»? Отменить нельзя.`)) return
    setBusy(true)
    try {
      await adminQuizzes.delete(token, quiz.id)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка удаления')
      setBusy(false)
    }
  }

  if (!quiz) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className={backBtn}>
          Назад к списку
        </button>
        {error ? (
          <div className="text-red-400/90 text-sm">{error}</div>
        ) : (
          <div className="text-paper-50/50 text-sm">загрузка…</div>
        )}
      </div>
    )
  }

  const isPublished = quiz.status === 'published'

  return (
    <div className="space-y-6">
      <button onClick={onBack} className={backBtn}>
        Назад к списку
      </button>

      <header className="space-y-2">
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-paper-50/50">
          <span>{quiz.topic}</span>
          <span>·</span>
          <span>{quiz.difficulty}</span>
          <span>·</span>
          <span>{quiz.items.length} вопросов</span>
          <span>·</span>
          <StatusBadge status={quiz.status} />
        </div>
        <h2 className="text-2xl font-serif text-paper-50">{quiz.title}</h2>
      </header>

      <div className="flex gap-2">
        {isPublished ? (
          <button
            onClick={unpublish}
            disabled={busy}
            className="rounded-lg border border-paper-50/20 px-4 py-2 text-sm text-paper-50/80 hover:bg-paper-50/5 disabled:opacity-50"
          >
            снять с публикации
          </button>
        ) : (
          <button
            onClick={publish}
            disabled={busy || quiz.items.length === 0}
            className="rounded-lg bg-emerald-500/90 text-ink-950 px-4 py-2 text-sm font-medium hover:bg-emerald-400 disabled:opacity-50"
          >
            опубликовать
          </button>
        )}
        <button
          onClick={remove}
          disabled={busy}
          className="rounded-lg border border-red-500/30 text-red-300 px-4 py-2 text-sm hover:bg-red-500/10 disabled:opacity-50"
        >
          удалить
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {quiz.items.map((it) => (
          <QuizItemCard
            key={it.id ?? it.position}
            token={token}
            quizId={quiz.id}
            item={it}
            onSaved={reload}
          />
        ))}
      </div>

      {isPublished && <QuizAttempts token={token} quizId={quiz.id} />}
    </div>
  )
}

const backBtn =
  'text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1'

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  if (status === 'published')
    return (
      <span className="inline-flex items-center gap-1 text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        опубликован
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-amber-300/80">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      черновик
    </span>
  )
}
