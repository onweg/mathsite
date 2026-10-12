import { useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { QuizChoice, QuizItemDTO, adminQuizzes } from '../../lib/api'

/**
 * Карточка одного вопроса в редакторе квиза.
 * Два режима: просмотр (markdown + подсветка правильного) и редактирование (textarea/inputs).
 */
export function QuizItemCard({
  token,
  quizId,
  item,
  onSaved,
  onDelete,
}: {
  token: string
  quizId: string
  item: QuizItemDTO
  onSaved: () => Promise<void> | void
  onDelete?: () => Promise<void> | void
}) {
  const [editing, setEditing] = useState(false)
  const [question, setQuestion] = useState(item.question_md)
  const [choices, setChoices] = useState<QuizChoice[]>(item.choices)
  const [correct, setCorrect] = useState(item.correct_answer)
  const [explanation, setExplanation] = useState(item.explanation ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!item.id) return
    const ids = new Set(choices.map((c) => c.id))
    if (!ids.has(correct)) {
      setError('выбери правильный вариант среди существующих id')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await adminQuizzes.updateItem(token, quizId, item.id, {
        question_md: question,
        choices,
        correct_answer: correct,
        explanation: explanation || null,
      })
      await onSaved()
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  function updateChoice(idx: number, patch: Partial<QuizChoice>) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-paper-50/10 p-5 space-y-3 bg-ink-900/30">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] uppercase tracking-widest text-paper-50/40">
            № {item.position}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-paper-50/60 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1"
            >
              править
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-xs text-red-400/70 hover:text-red-300 border border-red-500/20 rounded px-2 py-1"
              >
                удалить
              </button>
            )}
          </div>
        </div>

        <Markdown text={item.question_md} />

        <div className="space-y-1.5">
          {item.choices.map((c) => {
            const isCorrect = c.id === item.correct_answer
            return (
              <div
                key={c.id}
                className={`flex items-start gap-3 rounded-lg px-3 py-2 ${
                  isCorrect
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-ink-950/40 border border-paper-50/5'
                }`}
              >
                <span
                  className={`text-xs mt-0.5 font-mono ${
                    isCorrect ? 'text-emerald-300' : 'text-paper-50/40'
                  }`}
                >
                  {c.id}
                </span>
                <div className="flex-1">
                  <Markdown text={c.text} />
                </div>
                {isCorrect && (
                  <span className="text-[10px] uppercase tracking-widest text-emerald-300/80">
                    верно
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {item.explanation && (
          <div className="text-sm text-paper-50/60 border-l-2 border-paper-50/20 pl-3">
            <Markdown text={item.explanation} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-paper-50/20 p-5 space-y-3 bg-ink-900/60">
      <div className="text-[11px] uppercase tracking-widest text-paper-50/50">
        редактирование № {item.position}
      </div>

      <Field label="вопрос (markdown + $LaTeX$)">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          className={textarea}
        />
      </Field>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-paper-50/50">варианты</div>
        {choices.map((c, i) => (
          <div key={i} className="flex gap-2 items-start">
            <input
              type="text"
              value={c.id}
              onChange={(e) => updateChoice(i, { id: e.target.value })}
              className={`${inp} w-14 font-mono`}
            />
            <input
              type="text"
              value={c.text}
              onChange={(e) => updateChoice(i, { text: e.target.value })}
              className={`${inp} flex-1`}
            />
          </div>
        ))}
      </div>

      <Field label="правильный id">
        <input
          type="text"
          value={correct}
          onChange={(e) => setCorrect(e.target.value)}
          className={`${inp} w-20 font-mono`}
        />
      </Field>

      <Field label="объяснение (необязательно)">
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={2}
          className={textarea}
        />
      </Field>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={busy}
          className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'сохраняем…' : 'сохранить'}
        </button>
        <button
          onClick={() => {
            setEditing(false)
            setQuestion(item.question_md)
            setChoices(item.choices)
            setCorrect(item.correct_answer)
            setExplanation(item.explanation ?? '')
            setError(null)
          }}
          className="text-sm text-paper-50/60 hover:text-paper-50 border border-paper-50/10 rounded-lg px-4 py-2"
        >
          отмена
        </button>
      </div>
    </div>
  )
}

const inp =
  'bg-ink-950/80 border border-paper-50/10 rounded-md px-2.5 py-1.5 text-paper-50 outline-none focus:border-paper-50/40 text-sm'
const textarea =
  'w-full bg-ink-950/80 border border-paper-50/10 rounded-md px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40 text-sm font-mono'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wider text-paper-50/50">{label}</span>
      {children}
    </label>
  )
}
