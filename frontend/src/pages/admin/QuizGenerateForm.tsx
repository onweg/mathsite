import { useState } from 'react'
import { ApiError, Difficulty, QuizDTO, Source, adminQuizzes } from '../../lib/api'

const SOURCES: { value: Source | ''; label: string }[] = [
  { value: '', label: 'весь материал' },
  { value: 'textbook_8_algebra', label: 'алгебра (Макарычев 8)' },
  { value: 'textbook_8_geometry', label: 'геометрия (Атанасян 7–9)' },
  { value: 'olympiad', label: 'олимпиадные задачи' },
]

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export function QuizGenerateForm({
  token,
  onDone,
  onCancel,
}: {
  token: string
  onDone: (quiz: QuizDTO) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [source, setSource] = useState<Source | ''>('textbook_8_algebra')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Тема не нашлась в учебнике — предлагаем написать по программе 8 класса
  const [noSource, setNoSource] = useState(false)

  async function run(allowWithoutSource: boolean) {
    setBusy(true)
    setError(null)
    try {
      const quiz = await adminQuizzes.generate(token, {
        title: title.trim() || topic.trim(),
        topic: topic.trim(),
        source_key: source || null,
        difficulty,
        items_count: count,
        allow_without_source: allowWithoutSource,
      })
      onDone(quiz)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'no_source_material') {
        setNoSource(true)
        setError(null)
      } else {
        setNoSource(false)
        setError(e instanceof Error ? e.message : 'ошибка генерации')
      }
    } finally {
      setBusy(false)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setNoSource(false)
    run(false)
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-paper-50/10 p-6 space-y-4 bg-ink-900/40"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-widest text-paper-50/50">Новый квиз</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-paper-50/40 hover:text-paper-50/80"
        >
          отмена
        </button>
      </div>

      <Field label="название">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="например: Рациональные дроби"
          className={input}
        />
      </Field>

      <Field label="тема (для поиска по учебнику)">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="например: сокращение рациональных дробей"
          required
          className={input}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="источник">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source | '')}
            className={input}
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="сложность">
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className={input}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="число вопросов">
        <input
          type="number"
          min={1}
          max={15}
          value={count}
          onChange={(e) => setCount(Number(e.target.value) || 5)}
          className={input}
        />
      </Field>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {noSource && (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3">
          <p className="text-sm text-amber-200/90">
            По теме «{topic.trim()}» в выбранном источнике ничего не нашлось.
            Можно сменить источник или формулировку — либо сгенерировать без
            учебника, по программе 8 класса.
          </p>
          <p className="text-xs text-paper-50/40">
            Без учебника вопросы пишутся из общих знаний модели, поэтому
            вычитай черновик внимательнее обычного.
          </p>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={busy}
            className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-paper-50 transition hover:border-amber-400 disabled:opacity-50"
          >
            {busy ? 'генерируем…' : 'сгенерировать без учебника'}
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !topic.trim()}
        className="w-full bg-paper-50 text-ink-950 rounded-lg py-2.5 font-medium disabled:opacity-50 transition"
      >
        {busy ? 'генерируем…' : 'сгенерировать черновик'}
      </button>
      <p className="text-xs text-paper-50/40 text-center">
        на генерацию уйдёт 10–20 секунд
      </p>
    </form>
  )
}

const input =
  'w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wider text-paper-50/60">{label}</span>
      {children}
    </label>
  )
}
