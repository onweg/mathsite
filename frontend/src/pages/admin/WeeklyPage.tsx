import { useEffect, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import {
  MaterialDTO,
  WeeklyLevel,
  WeeklyTaskDTO,
  adminMaterials,
  adminWeekly,
} from '../../lib/api'
import { WeeklySubmissions } from './WeeklySubmissions'

type View =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'generate' }
  | { mode: 'edit'; task: WeeklyTaskDTO }
  | { mode: 'submissions'; task: WeeklyTaskDTO }

export function WeeklyPage({ token }: { token: string }) {
  const [tasks, setTasks] = useState<WeeklyTaskDTO[] | null>(null)
  const [view, setView] = useState<View>({ mode: 'list' })
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    try {
      setTasks(await adminWeekly.list(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка загрузки')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  if (view.mode === 'create') {
    return (
      <WeeklyEditor
        token={token}
        publishedOther={tasks?.find((t) => t.is_published) ?? null}
        onCancel={() => {
          reload()
          setView({ mode: 'list' })
        }}
        onDone={() => {
          reload()
          setView({ mode: 'list' })
        }}
      />
    )
  }

  if (view.mode === 'generate') {
    return (
      <WeeklyGenerateForm
        token={token}
        onCancel={() => setView({ mode: 'list' })}
        onGenerated={(task) => {
          reload()
          // Сразу в редактор: черновик нейронки всегда нужно вычитать.
          setView({ mode: 'edit', task })
        }}
      />
    )
  }

  if (view.mode === 'submissions') {
    return (
      <WeeklySubmissions
        token={token}
        task={view.task}
        onBack={() => {
          reload()
          setView({ mode: 'list' })
        }}
      />
    )
  }

  if (view.mode === 'edit') {
    // Задача, опубликованная прямо сейчас, — не считая открытую в редакторе.
    // Нужна, чтобы предупредить: публикация новой снимет её с сайта.
    const published = tasks?.find((t) => t.is_published && t.id !== view.task.id)
    return (
      <WeeklyEditor
        token={token}
        task={view.task}
        publishedOther={published ?? null}
        onCancel={() => {
          // Без перезагрузки список показывал бы устаревший статус:
          // учитель публикует, выходит «назад» и видит «черновик».
          reload()
          setView({ mode: 'list' })
        }}
        onDone={() => {
          reload()
          setView({ mode: 'list' })
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg text-paper-50 font-serif">Задача недели</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView({ mode: 'generate' })}
            className="rounded-lg border border-gold-500/50 bg-gold-500/10 px-4 py-2 text-sm text-paper-50 hover:border-gold-500"
          >
            сгенерировать
          </button>
          <button
            onClick={() => setView({ mode: 'create' })}
            className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium"
          >
            + новая задача
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {tasks === null ? (
        <div className="text-paper-50/50 text-sm">загрузка…</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-50/15 p-8 text-center text-paper-50/50">
          ещё нет задач. нажми «новая задача» чтобы создать первую.
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-4 flex items-center justify-between gap-4"
            >
              <button
                onClick={() => setView({ mode: 'edit', task: t })}
                className="text-left flex-1 min-w-0 hover:text-gold-500 transition"
              >
                <div className="text-paper-50 truncate">{t.title}</div>
                <div className="text-xs text-paper-50/40 mt-0.5 truncate">
                  {t.body_md.slice(0, 80).replace(/\n/g, ' ')}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => setView({ mode: 'submissions', task: t })}
                  className="rounded-lg border border-paper-50/10 px-3 py-1.5 text-xs text-paper-50/60 transition hover:border-paper-50/30 hover:text-paper-50"
                >
                  решения
                  {t.submissions_count > 0 && (
                    <span className="ml-2 text-paper-50/40">{t.submissions_count}</span>
                  )}
                  {t.new_submissions_count > 0 && (
                    <span className="ml-2 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-medium text-ink-950">
                      {t.new_submissions_count}
                    </span>
                  )}
                </button>
                <StatusBadge published={t.is_published} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusBadge({ published }: { published: boolean }) {
  if (published)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        опубликована
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-300/80 shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      черновик
    </span>
  )
}

/* ----- Редактор ----- */

function WeeklyEditor({
  token,
  task,
  publishedOther,
  onCancel,
  onDone,
}: {
  token: string
  task?: WeeklyTaskDTO
  /** Задача, которая сейчас висит на сайте, если это не редактируемая. */
  publishedOther?: WeeklyTaskDTO | null
  onCancel: () => void
  onDone: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [body, setBody] = useState(task?.body_md ?? '')
  const [answer, setAnswer] = useState(task?.answer_md ?? '')
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<WeeklyTaskDTO | undefined>(task)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (current) {
        const t = await adminWeekly.update(token, current.id, {
          title,
          body_md: body,
          answer_md: answer,
        })
        setCurrent(t)
      } else {
        const t = await adminWeekly.create(token, {
          title,
          body_md: body,
          answer_md: answer,
        })
        setCurrent(t)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (!current) {
      setError('сначала сохрани')
      return
    }
    // На сайте всегда одна задача недели: публикация новой снимает прежнюю.
    if (
      publishedOther &&
      !confirm(
        `Сейчас на сайте висит «${publishedOther.title}».\n\n` +
          `Опубликовать «${current.title}» вместо неё? ` +
          `Прежняя задача уйдёт с сайта, решения по ней сохранятся.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      setCurrent(await adminWeekly.publish(token, current.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка публикации')
    } finally {
      setBusy(false)
    }
  }

  async function unpublish() {
    if (!current) return
    setBusy(true)
    try {
      setCurrent(await adminWeekly.unpublish(token, current.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка снятия')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!current) return
    if (!confirm(`Удалить задачу «${current.title}»?`)) return
    setBusy(true)
    try {
      await adminWeekly.delete(token, current.id)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка удаления')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={onCancel} className={backBtn}>
        Назад к списку
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-lg text-paper-50 font-serif">
          {current ? 'редактирование' : 'новая задача недели'}
        </h2>
        <button
          onClick={() => setPreview((p) => !p)}
          className="text-xs text-paper-50/60 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1"
        >
          {preview ? 'редактировать' : 'предпросмотр'}
        </button>
      </div>

      {!preview ? (
        <>
          <Field label="заголовок">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Задача № 143"
              className={input}
            />
          </Field>

          <Field label="условие — его видят ученики">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className={textarea}
            />
            <p className="text-[11px] text-paper-50/40 pt-1">
              Формулы — между знаками доллара: <code className="text-paper-50/60">$x^2+1$</code> в
              строке, <code className="text-paper-50/60">$$...$$</code> отдельным блоком. Жирный —{' '}
              <code className="text-paper-50/60">**текст**</code>. Нажми «предпросмотр», чтобы
              увидеть, как это выглядит у ученика.
            </p>
          </Field>

          <Field label="решение и ответ — только для тебя">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              className={textarea}
            />
            <p className="text-[11px] text-paper-50/40 pt-1">
              Решение не уходит на сайт — публичный ответ отдаёт только условие.
            </p>
          </Field>
        </>
      ) : (
        <div className="space-y-6 rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-paper-50/50">Условие</div>
            <div className="mt-3 text-paper-50">
              <Markdown text={body || '…'} />
            </div>
          </div>
          <div className="border-t border-paper-50/10 pt-6">
            <div className="text-xs uppercase tracking-widest text-amber-300/80">
              Решение (только для учителя)
            </div>
            <div className="mt-3 text-paper-50/80">
              <Markdown text={answer || '…'} />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          onClick={save}
          disabled={busy || !title.trim() || !body.trim() || !answer.trim()}
          className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'сохраняем…' : 'сохранить'}
        </button>

        {current &&
          (current.is_published ? (
            <button
              onClick={unpublish}
              disabled={busy}
              className="rounded-lg border border-paper-50/20 px-4 py-2 text-sm text-paper-50/80 hover:bg-paper-50/5 disabled:opacity-50"
            >
              снять с публикации
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={publish}
                disabled={busy}
                className="rounded-lg bg-emerald-500/90 text-ink-950 px-4 py-2 text-sm font-medium hover:bg-emerald-400 disabled:opacity-50"
              >
                опубликовать
              </button>
              {publishedOther && (
                <span className="text-[11px] text-amber-300/70">
                  заменит «{publishedOther.title}» на сайте
                </span>
              )}
            </div>
          ))}

        {current && (
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-lg border border-red-500/30 text-red-300 px-4 py-2 text-sm hover:bg-red-500/10 disabled:opacity-50"
          >
            удалить
          </button>
        )}
      </div>
    </div>
  )
}

const input =
  'w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40'
const textarea =
  'w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40 font-mono text-sm'
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

/* ----- Генерация нейронкой ----- */

const LEVELS: { value: WeeklyLevel; label: string }[] = [
  { value: 'school', label: 'школьная' },
  { value: 'olympiad', label: 'олимпиадная' },
  { value: 'hard', label: 'сложная' },
]

function WeeklyGenerateForm({
  token,
  onCancel,
  onGenerated,
}: {
  token: string
  onCancel: () => void
  onGenerated: (task: WeeklyTaskDTO) => void
}) {
  const [topic, setTopic] = useState('')
  const [sourceKey, setSourceKey] = useState<string>('textbook_8_algebra')
  const [level, setLevel] = useState<WeeklyLevel>('olympiad')
  const [materials, setMaterials] = useState<MaterialDTO[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminMaterials
      .list(token)
      .then((m) => setMaterials(m.filter((x) => x.status === 'ready')))
      .catch(() => setMaterials([]))
  }, [token])

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const task = await adminWeekly.generate(token, {
        topic: topic.trim(),
        source_key: sourceKey || null,
        level,
      })
      onGenerated(task)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось сгенерировать')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={onCancel} className={backBtn}>
        Назад к списку
      </button>

      <h2 className="text-lg text-paper-50 font-serif">задача недели от нейросети</h2>
      <p className="text-sm text-paper-50/50 max-w-2xl">
        Нейросеть берёт подходящие куски из выбранного источника и составляет по ним одну задачу
        с решением. Получится черновик — он сразу откроется в редакторе. На сайт попадёт только
        после твоей кнопки «опубликовать».
      </p>

      <Field label="тема">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Например: квадратные уравнения, теорема Пифагора, делимость"
          className={input}
        />
      </Field>

      <Field label="источник">
        <select
          value={sourceKey}
          onChange={(e) => setSourceKey(e.target.value)}
          className={input}
        >
          <option value="textbook_8_algebra">учебник: алгебра 8 класс</option>
          <option value="textbook_8_geometry">учебник: геометрия 7–9</option>
          <option value="olympiad">олимпиадный вариант (одна работа)</option>
          {materials.map((m) => (
            <option key={m.source_key} value={m.source_key}>
              материал: {m.title}
            </option>
          ))}
          <option value="">искать по всем материалам</option>
        </select>
      </Field>

      <Field label="уровень">
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              onClick={() => setLevel(l.value)}
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                level === l.value
                  ? 'border-gold-500/70 bg-gold-500/10 text-paper-50'
                  : 'border-paper-50/10 text-paper-50/60 hover:border-paper-50/30'
              }`}
            >
              {l.label}
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
        onClick={run}
        disabled={busy || topic.trim().length < 2}
        className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? 'нейросеть думает, это до минуты…' : 'сгенерировать черновик'}
      </button>
    </div>
  )
}
