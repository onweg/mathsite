import { useEffect, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { WeeklyTaskDTO, adminWeekly } from '../../lib/api'

type View =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; task: WeeklyTaskDTO }

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
        onCancel={() => setView({ mode: 'list' })}
        onDone={() => {
          reload()
          setView({ mode: 'list' })
        }}
      />
    )
  }

  if (view.mode === 'edit') {
    return (
      <WeeklyEditor
        token={token}
        task={view.task}
        onCancel={() => setView({ mode: 'list' })}
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
        <button
          onClick={() => setView({ mode: 'create' })}
          className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium"
        >
          + новая задача
        </button>
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
              <StatusBadge published={t.is_published} />
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
  onCancel,
  onDone,
}: {
  token: string
  task?: WeeklyTaskDTO
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
        ← к списку
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

          <Field label="условие (markdown + $LaTeX$)">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className={textarea}
            />
          </Field>

          <Field label="решение / ответ (markdown + $LaTeX$)">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              className={textarea}
            />
            <p className="text-[11px] text-paper-50/40 pt-1">
              Этот текст НЕ показывается ученикам. Виден только тебе в админке.
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
            <button
              onClick={publish}
              disabled={busy}
              className="rounded-lg bg-emerald-500/90 text-ink-950 px-4 py-2 text-sm font-medium hover:bg-emerald-400 disabled:opacity-50"
            >
              опубликовать
            </button>
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
