import { useEffect, useState } from 'react'
import { QuizDTO, QuizItemDTO, adminQuizzes } from '../../lib/api'
import { QuizAttempts } from './QuizAttempts'
import { RefineBox } from './RefineBox'
import { QuizItemCard } from './QuizItemCard'
import { blankItem } from './QuizManualForm'

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

  /**
   * Добавление и удаление вопросов идут через полную замену списка — отдельных
   * ручек на один вопрос в API нет. Побочный эффект: у всех вопросов меняются
   * id, поэтому операция доступна только у черновика. У опубликованного квиза
   * это разорвало бы связь уже сданных попыток с вопросами.
   */
  async function saveItems(items: Omit<QuizItemDTO, 'id'>[]) {
    if (!quiz) return
    setBusy(true)
    setError(null)
    try {
      setQuiz(await adminQuizzes.replaceItems(token, quiz.id, items))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось сохранить вопросы')
    } finally {
      setBusy(false)
    }
  }

  function addQuestion() {
    if (!quiz) return
    saveItems([...quiz.items.map(stripId), blankItem(quiz.items.length + 1)])
  }

  function removeQuestion(position: number) {
    if (!quiz) return
    if (!confirm(`Удалить вопрос ${position}?`)) return
    saveItems(
      quiz.items
        .filter((it) => it.position !== position)
        .map((it, i) => ({ ...stripId(it), position: i + 1 })),
    )
  }

  async function refine(instruction: string) {
    if (!quiz) return
    setQuiz(await adminQuizzes.refine(token, quiz.id, instruction))
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
        <a
          href={`/admin/print-quiz?quiz=${quiz.id}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-paper-50/20 px-4 py-2 text-sm text-paper-50/80 transition hover:bg-paper-50/5"
        >
          печать
        </a>
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
            onDelete={
              isPublished ? undefined : () => removeQuestion(it.position)
            }
          />
        ))}
      </div>

      {!isPublished && quiz.items.length > 0 && (
        <RefineBox
          examples={[
            'третий вопрос слишком лёгкий, усложни',
            'убери вопросы про геометрию',
            'добавь два вопроса на сокращение дробей',
          ]}
          note="Модель видит текущие вопросы и правит только то, о чём просишь. Остальные переносит как есть, но id вопросов меняются — доработка доступна только у черновика."
          disabled={busy}
          onSubmit={refine}
        />
      )}

      {isPublished ? (
        <p className="text-xs text-paper-50/40">
          Состав вопросов у опубликованного квиза не меняется — иначе уже
          сданные попытки перестанут соответствовать вопросам. Сними с
          публикации, чтобы добавить или убрать вопрос.
        </p>
      ) : (
        <button
          onClick={addQuestion}
          disabled={busy || quiz.items.length >= 20}
          className="rounded-lg border border-dashed border-paper-50/20 px-4 py-3 text-sm text-paper-50/60 transition hover:border-paper-50/40 hover:text-paper-50 disabled:opacity-40"
        >
          + добавить вопрос
        </button>
      )}

      {isPublished && <QuizAttempts token={token} quizId={quiz.id} />}
    </div>
  )
}

/** API ждёт вопросы без id: при замене списка они выдаются заново. */
function stripId(it: QuizItemDTO): Omit<QuizItemDTO, 'id'> {
  const { id: _id, ...rest } = it
  return rest
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
