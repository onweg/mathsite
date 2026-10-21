import { useState } from 'react'
import { Difficulty, QuizDTO, adminQuizzes } from '../../lib/api'

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'простой' },
  { value: 'medium', label: 'средний' },
  { value: 'hard', label: 'сложный' },
]

/**
 * Создание квиза руками: сначала название и тема, дальше — редактор,
 * где вопросы добавляются по одному. Первый вопрос создаётся сразу
 * заготовкой, чтобы учителю было что править, а не пустой экран.
 */
export function QuizManualForm({
  token,
  onCancel,
  onCreated,
}: {
  token: string
  onCancel: () => void
  onCreated: (quiz: QuizDTO) => void
}) {
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const quiz = await adminQuizzes.create(token, {
        title: title.trim(),
        topic: topic.trim() || title.trim(),
        difficulty,
        items: [blankItem(1)],
      })
      onCreated(quiz)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось создать')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={onCancel} className={backBtn}>
        Назад к списку
      </button>

      <h2 className="text-lg text-paper-50 font-serif">свой тест</h2>
      <p className="text-sm text-paper-50/50 max-w-2xl">
        Вопросы напишешь сам, нейросеть не участвует. Тест создастся черновиком
        с одним вопросом-заготовкой — дальше добавляй и правь сколько нужно.
      </p>

      <Field label="название — его видят ученики">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: Квадратные уравнения · проверка"
          className={input}
        />
      </Field>

      <Field label="тема (для списка в админке)">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Если оставить пустым — возьмём название"
          className={input}
        />
      </Field>

      <Field label="сложность">
        <div className="flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                difficulty === d.value
                  ? 'border-gold-500/70 bg-gold-500/10 text-paper-50'
                  : 'border-paper-50/10 text-paper-50/60 hover:border-paper-50/30'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </Field>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        onClick={create}
        disabled={busy || !title.trim()}
        className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? 'создаём…' : 'создать и перейти к вопросам'}
      </button>
    </div>
  )
}

/** Заготовка вопроса. Проходит серверную валидацию, но её очевидно надо править. */
export function blankItem(position: number) {
  return {
    position,
    kind: 'mcq' as const,
    question_md: `Вопрос ${position}`,
    choices: [
      { id: 'a', text: 'Вариант 1' },
      { id: 'b', text: 'Вариант 2' },
      { id: 'c', text: 'Вариант 3' },
      { id: 'd', text: 'Вариант 4' },
    ],
    correct_answer: 'a',
    explanation: null as string | null,
  }
}

const input =
  'w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40'
const backBtn =
  'text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-paper-50/60">{label}</div>
      {children}
    </div>
  )
}
