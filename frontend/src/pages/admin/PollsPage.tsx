import { useEffect, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import {
  PollAdminDTO,
  PollKind,
  PollResultsDTO,
  adminPolls,
} from '../../lib/api'

type View =
  | { mode: 'list' }
  | { mode: 'edit'; poll?: PollAdminDTO }
  | { mode: 'results'; poll: PollAdminDTO }

export function PollsPage({ token }: { token: string }) {
  const [polls, setPolls] = useState<PollAdminDTO[] | null>(null)
  const [view, setView] = useState<View>({ mode: 'list' })
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    try {
      setPolls(await adminPolls.list(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка загрузки')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  if (view.mode === 'edit') {
    return (
      <PollEditor
        token={token}
        poll={view.poll}
        onCancel={() => setView({ mode: 'list' })}
        onDone={() => {
          reload()
          setView({ mode: 'list' })
        }}
      />
    )
  }

  if (view.mode === 'results') {
    return (
      <PollResults
        token={token}
        poll={view.poll}
        onBack={() => {
          reload()
          setView({ mode: 'list' })
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg text-paper-50 font-serif">Опросы</h2>
        <button
          onClick={() => setView({ mode: 'edit' })}
          className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium"
        >
          + новый опрос
        </button>
      </div>

      <p className="text-sm text-paper-50/50 max-w-2xl">
        Вопрос классу: какую тему повторить, какой формат урока нравится, что
        было непонятно. Опрос появляется на сайте только после публикации.
      </p>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {polls === null ? (
        <div className="text-paper-50/50 text-sm">загрузка…</div>
      ) : polls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-50/15 p-8 text-center text-paper-50/50">
          опросов пока нет
        </div>
      ) : (
        <ul className="space-y-2">
          {polls.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-4 flex items-center justify-between gap-4"
            >
              <button
                onClick={() => setView({ mode: 'edit', poll: p })}
                className="text-left flex-1 min-w-0 hover:text-gold-500 transition"
              >
                <div className="text-paper-50 truncate">{p.title}</div>
                <div className="text-xs text-paper-50/40 mt-0.5">
                  {p.kind === 'text'
                    ? 'свободный ответ'
                    : `${p.options.length} вариантов${p.multiple ? ' · можно несколько' : ''}`}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => setView({ mode: 'results', poll: p })}
                  className="rounded-lg border border-paper-50/10 px-3 py-1.5 text-xs text-paper-50/60 transition hover:border-paper-50/30 hover:text-paper-50"
                >
                  ответы
                  {p.answers_count > 0 && (
                    <span className="ml-2 text-paper-50/40">{p.answers_count}</span>
                  )}
                </button>
                {p.is_published ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    открыт
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-300/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    черновик
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ----- Редактор ----- */

function PollEditor({
  token,
  poll,
  onCancel,
  onDone,
}: {
  token: string
  poll?: PollAdminDTO
  onCancel: () => void
  onDone: () => void
}) {
  const [current, setCurrent] = useState<PollAdminDTO | undefined>(poll)
  const [title, setTitle] = useState(poll?.title ?? '')
  const [question, setQuestion] = useState(poll?.question_md ?? '')
  const [kind, setKind] = useState<PollKind>(poll?.kind ?? 'choice')
  const [multiple, setMultiple] = useState(poll?.multiple ?? false)
  const [allowComment, setAllowComment] = useState(poll?.allow_comment ?? true)
  const [options, setOptions] = useState<string[]>(
    poll?.options.map((o) => o.text) ?? ['', ''],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Менять вид у сохранённого опроса нельзя: у него уже другая форма ответов.
  const kindLocked = Boolean(current)
  const filled = options.map((o) => o.trim()).filter(Boolean)
  const canSave =
    title.trim().length > 0 && (kind === 'text' || filled.length >= 2)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (current) {
        setCurrent(
          await adminPolls.update(token, current.id, {
            title,
            question_md: question,
            multiple,
            allow_comment: allowComment,
            ...(kind === 'choice' ? { options: filled } : {}),
          }),
        )
      } else {
        setCurrent(
          await adminPolls.create(token, {
            title,
            question_md: question,
            kind,
            multiple,
            allow_comment: allowComment,
            options: kind === 'choice' ? filled : [],
          }),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  async function togglePublish() {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      setCurrent(
        current.is_published
          ? await adminPolls.unpublish(token, current.id)
          : await adminPolls.publish(token, current.id),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не вышло')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!current) return
    if (!confirm(`Удалить опрос «${current.title}» вместе с ответами?`)) return
    setBusy(true)
    try {
      await adminPolls.delete(token, current.id)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка удаления')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={onCancel} className={backBtn}>
        Назад к опросам
      </button>

      <h2 className="text-lg text-paper-50 font-serif">
        {current ? 'редактирование опроса' : 'новый опрос'}
      </h2>

      <Field label="заголовок — его видят ученики">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: Какую тему повторить на следующем уроке?"
          className={input}
        />
      </Field>

      <Field label="пояснение (необязательно)">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          className={textarea}
        />
      </Field>

      <Field label="вид ответа">
        <div className="flex flex-wrap gap-2">
          {(['choice', 'text'] as PollKind[]).map((k) => (
            <button
              key={k}
              onClick={() => !kindLocked && setKind(k)}
              disabled={kindLocked}
              className={`rounded-lg border px-4 py-2 text-sm transition disabled:opacity-40 ${
                kind === k
                  ? 'border-gold-500/70 bg-gold-500/10 text-paper-50'
                  : 'border-paper-50/10 text-paper-50/60 hover:border-paper-50/30'
              }`}
            >
              {k === 'choice' ? 'варианты на выбор' : 'свободный ответ'}
            </button>
          ))}
        </div>
        {kindLocked && (
          <p className="text-[11px] text-paper-50/40 pt-1">
            Вид ответа у сохранённого опроса не меняется — создай новый.
          </p>
        )}
      </Field>

      {kind === 'choice' && (
        <Field label="варианты">
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={o}
                  onChange={(e) =>
                    setOptions((prev) =>
                      prev.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                  placeholder={`Вариант ${i + 1}`}
                  className={input}
                />
                {options.length > 2 && (
                  <button
                    onClick={() =>
                      setOptions((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="shrink-0 text-xs text-paper-50/30 hover:text-red-300"
                  >
                    убрать
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button
                onClick={() => setOptions((prev) => [...prev, ''])}
                className="text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1"
              >
                + вариант
              </button>
            )}
          </div>
          {current && (
            <p className="text-[11px] text-amber-300/70 pt-2">
              Если изменить список вариантов, уже собранные ответы по этому
              опросу удалятся — иначе в сводке повиснут голоса за варианты,
              которых больше нет.
            </p>
          )}
        </Field>
      )}

      <div className="space-y-2">
        {kind === 'choice' && (
          <>
            <Check
              checked={multiple}
              onChange={setMultiple}
              label="можно выбрать несколько вариантов"
            />
            <Check
              checked={allowComment}
              onChange={setAllowComment}
              label="разрешить свой вариант текстом"
            />
          </>
        )}
      </div>

      {(title.trim() || question.trim()) && (
        <div className="rounded-2xl border border-paper-50/10 bg-ink-900/40 p-5">
          <div className="text-xs uppercase tracking-widest text-paper-50/50">
            Как увидит ученик
          </div>
          <div className="mt-3 font-serif text-lg text-paper-50">{title || '…'}</div>
          {question && (
            <div className="mt-2 text-sm text-paper-100/70">
              <Markdown text={question} />
            </div>
          )}
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
          disabled={busy || !canSave}
          className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'сохраняем…' : 'сохранить'}
        </button>

        {current && (
          <button
            onClick={togglePublish}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              current.is_published
                ? 'border border-paper-50/20 text-paper-50/80 hover:bg-paper-50/5'
                : 'bg-emerald-500/90 text-ink-950 hover:bg-emerald-400'
            }`}
          >
            {current.is_published ? 'закрыть опрос' : 'опубликовать'}
          </button>
        )}

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

/* ----- Результаты ----- */

function PollResults({
  token,
  poll,
  onBack,
}: {
  token: string
  poll: PollAdminDTO
  onBack: () => void
}) {
  const [data, setData] = useState<PollResultsDTO | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminPolls
      .results(token, poll.id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'ошибка загрузки'))
  }, [poll.id])

  const max = data ? Math.max(1, ...data.tallies.map((t) => t.votes)) : 1

  return (
    <div className="space-y-5">
      <button onClick={onBack} className={backBtn}>
        Назад к опросам
      </button>

      <div>
        <h2 className="text-lg text-paper-50 font-serif">Ответы · {poll.title}</h2>
        <p className="text-sm text-paper-50/50 mt-1">
          {data === null ? 'загрузка…' : `всего ответов: ${data.total_answers}`}
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {data && data.tallies.length > 0 && (
        <ul className="space-y-3">
          {data.tallies.map((t) => {
            const pct = data.total_answers
              ? Math.round((t.votes / data.total_answers) * 100)
              : 0
            return (
              <li key={t.option_id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-paper-50">{t.text}</span>
                  <span className="shrink-0 font-mono text-xs text-paper-50/60">
                    {t.votes} · {pct}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-paper-50/5">
                  <div
                    className="h-full rounded-full bg-sage-500/70"
                    style={{ width: `${(t.votes / max) * 100}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {data && (
        <div className="space-y-3">
          <h3 className="text-sm uppercase tracking-widest text-paper-50/60">
            Свои ответы и комментарии
          </h3>
          {data.comments.length === 0 ? (
            <p className="text-sm text-paper-50/50">пока ничего не написали</p>
          ) : (
            <ul className="space-y-2">
              {data.comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-paper-50">{c.student_name}</span>
                    {c.class_label && (
                      <span className="text-xs text-paper-50/40">{c.class_label}</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-paper-100/80">
                    {c.comment}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/* ----- мелочи ----- */

const input =
  'w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40'
const textarea =
  'w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40 text-sm'
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

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-paper-50/75">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-gold-500"
      />
      {label}
    </label>
  )
}
