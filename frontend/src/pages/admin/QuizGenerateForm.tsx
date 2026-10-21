import { useEffect, useState } from 'react'
import {
  ApiError,
  Difficulty,
  MaterialDTO,
  QuizDTO,
  Source,
  SourcePreviewDTO,
  adminMaterials,
  adminQuizzes,
} from '../../lib/api'

/** Встроенные источники. Загруженные материалы подставляются следом, из API. */
const BUILTIN_SOURCES: { value: Source | ''; label: string }[] = [
  { value: '', label: 'весь материал' },
  { value: 'textbook_8_algebra', label: 'алгебра (Макарычев 8)' },
  { value: 'textbook_8_geometry', label: 'геометрия (Атанасян 7–9)' },
  { value: 'olympiad', label: 'олимпиадные задачи' },
]

/** Отдельное значение селекта: в учебник не ходим вовсе. */
const NO_MATERIALS = '__none__'

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
  const [source, setSource] = useState<string>('textbook_8_algebra')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [count, setCount] = useState(5)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Тема не нашлась в учебнике — предлагаем написать по программе 8 класса
  const [noSource, setNoSource] = useState(false)
  const [materials, setMaterials] = useState<MaterialDTO[]>([])
  const [preview, setPreview] = useState<SourcePreviewDTO | null>(null)
  const [previewing, setPreviewing] = useState(false)

  // Загруженные учителем PDF тоже можно взять источником — раньше их не было
  // в списке, и целиться в «Сборник ОГЭ» было нечем.
  useEffect(() => {
    adminMaterials
      .list(token)
      .then((all) => setMaterials(all.filter((m) => m.status === 'ready')))
      .catch(() => setMaterials([]))
  }, [token])

  const useMaterials = source !== NO_MATERIALS
  const sourceKey = useMaterials && source ? (source as Source) : null

  async function run(allowWithoutSource: boolean) {
    setBusy(true)
    setError(null)
    try {
      const quiz = await adminQuizzes.generate(token, {
        title: title.trim() || topic.trim(),
        topic: topic.trim(),
        source_key: sourceKey,
        difficulty,
        items_count: count,
        allow_without_source: allowWithoutSource,
        use_materials: useMaterials,
        hint: hint.trim() || undefined,
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

  async function showSource() {
    setPreviewing(true)
    setPreview(null)
    try {
      setPreview(await adminQuizzes.sourcePreview(token, {
        topic: topic.trim(),
        source_key: sourceKey,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось посмотреть источник')
    } finally {
      setPreviewing(false)
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
        <h3 className="text-sm uppercase tracking-widest text-paper-50/50">Новый тест</h3>
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

      <Field label="тема (по ней ищем в учебнике)">
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
            onChange={(e) => {
              setSource(e.target.value)
              setPreview(null)
            }}
            className={input}
          >
            {BUILTIN_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            {materials.map((m) => (
              <option key={m.source_key} value={m.source_key}>
                {m.title}
              </option>
            ))}
            <option value={NO_MATERIALS}>без учебника — только нейросеть</option>
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

      {!useMaterials && (
        <p className="text-xs text-amber-200/70">
          Вопросы напишутся из общих знаний модели, без опоры на учебник, —
          вычитай черновик внимательнее обычного.
        </p>
      )}

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

      <Field label="пожелания — необязательно">
        <textarea
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="например: без задач на площадь, числа до 20, два вопроса на признаки"
          className={input + ' resize-y'}
        />
      </Field>
      <p className="-mt-2 text-xs text-paper-50/40">
        Пожелания идут прямо модели и в поиск по учебнику не попадают, поэтому
        «без площадей» не притащит главу про площади.
      </p>

      {useMaterials && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={showSource}
            disabled={previewing || !topic.trim()}
            className="text-xs text-paper-50/50 underline underline-offset-4 transition hover:text-paper-50 disabled:opacity-40"
          >
            {previewing ? 'ищем…' : 'показать, что найдётся в учебнике'}
          </button>
          {preview && <SourcePreview data={preview} />}
        </div>
      )}

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

/**
 * Что модель получит на вход. Нужен, чтобы учитель видел своими глазами,
 * по какому материалу пишется тест и сколько в нём формул, развалившихся
 * при извлечении из PDF.
 */
function SourcePreview({ data }: { data: SourcePreviewDTO }) {
  if (data.hits.length === 0) {
    return (
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
        По этой теме в выбранном источнике ничего не нашлось. Генерация
        предложит написать без учебника.
      </p>
    )
  }
  return (
    <div className="space-y-2 rounded-lg border border-paper-50/10 bg-ink-950/60 p-3">
      <p className="text-xs text-paper-50/50">
        нашлось фрагментов: {data.hits.length}
        {data.garbled_count > 0 && (
          <span className="text-amber-200/80">
            {' '}· с повреждёнными формулами: {data.garbled_count}
          </span>
        )}
      </p>
      <ul className="space-y-2">
        {data.hits.map((h, i) => (
          <li key={i} className="text-xs leading-relaxed text-paper-100/60">
            <span className="text-paper-50/40">
              {h.source_key}
              {h.page ? ` · стр. ${h.page}` : ''} · совпадение{' '}
              {Math.round(h.similarity * 100)}%
            </span>
            {h.garbled && (
              <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-200/90">
                формулы повреждены
              </span>
            )}
            <p className="mt-1 line-clamp-3">{h.text}</p>
          </li>
        ))}
      </ul>
      {data.garbled_count > 0 && (
        <p className="text-xs text-amber-200/70">
          В таких фрагментах дроби слиплись при извлечении из PDF. Модели
          велено не переписывать их дословно, но вопросы всё равно проверь.
        </p>
      )}
    </div>
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
