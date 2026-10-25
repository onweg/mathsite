import { useEffect, useState } from 'react'
import {
  LibraryCollectionDTO,
  LibraryItemDTO,
  LibraryKind,
  MaterialStatus,
  adminLibrary,
  fileUrl,
  publicLibrary,
} from '../../lib/api'
import { LibraryStats } from './LibraryStats'

const POLL_MS = 3000
const KIND_LABEL: Record<LibraryKind, string> = {
  article: 'статья',
  link: 'ссылка',
  file: 'файл',
}

type View = { mode: 'list' } | { mode: 'edit'; item: LibraryItemDTO } | { mode: 'stats' }

/**
 * Наполнение разделов «Математика вокруг нас», олимпиады, ОГЭ, ЕГЭ.
 *
 * Полки заводит бэкенд — тут только содержимое: статьи, ссылки и файлы.
 * Приложенный PDF заодно уходит в индексацию и появляется в списке
 * источников на вкладках «Тесты» и «Задача недели».
 */
export function LibraryPage({ token }: { token: string }) {
  const [collections, setCollections] = useState<LibraryCollectionDTO[] | null>(null)
  const [collection, setCollection] = useState('around')
  const [items, setItems] = useState<LibraryItemDTO[] | null>(null)
  const [view, setView] = useState<View>({ mode: 'list' })
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    try {
      setItems(await adminLibrary.list(token, collection))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка загрузки')
    }
  }

  useEffect(() => {
    publicLibrary
      .collections()
      .then(setCollections)
      .catch(() => setCollections([]))
  }, [])

  useEffect(() => {
    setItems(null)
    reload()
  }, [collection])

  // Пока PDF индексируется — обновляем список, как на вкладке «Материалы».
  useEffect(() => {
    if (!items) return
    const busy = items.some(
      (i) => i.material_status === 'pending' || i.material_status === 'indexing',
    )
    if (!busy) return
    const t = setTimeout(reload, POLL_MS)
    return () => clearTimeout(t)
  }, [items])

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не получилось')
    }
  }

  /** Стрелки двигают материал локально, на сервер уезжает весь новый порядок. */
  async function move(index: number, delta: number) {
    if (!items) return
    const next = [...items]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next)
    await act(() => adminLibrary.reorder(token, collection, next.map((i) => i.id)))
  }

  if (view.mode === 'stats') {
    return (
      <LibraryStats
        token={token}
        collection={collection}
        collections={collections ?? []}
        onBack={() => setView({ mode: 'list' })}
      />
    )
  }

  if (view.mode === 'edit') {
    return (
      <ItemEditor
        token={token}
        item={view.item}
        onCancel={() => setView({ mode: 'list' })}
        onDone={() => {
          setView({ mode: 'list' })
          reload()
        }}
      />
    )
  }

  const current = collections?.find((c) => c.slug === collection)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-serif text-lg text-paper-50">Разделы с материалами</h2>
        <button
          onClick={() => setView({ mode: 'stats' })}
          className="rounded-lg border border-paper-50/20 px-3 py-1.5 text-sm text-paper-50/70 transition hover:text-paper-50"
        >
          кто что смотрел
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(collections ?? []).map((c) => (
          <button
            key={c.slug}
            onClick={() => setCollection(c.slug)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              collection === c.slug
                ? 'border-paper-50/40 bg-paper-50/5 text-paper-50'
                : 'border-paper-50/10 text-paper-50/50 hover:text-paper-50/80'
            }`}
          >
            {c.title}
            <span className="ml-2 text-xs text-paper-50/35">{c.count}</span>
          </button>
        ))}
      </div>

      {current && <p className="max-w-2xl text-sm text-paper-50/50">{current.subtitle}</p>}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400/90">
          {error}
        </div>
      )}

      <AddPanel
        token={token}
        collection={collection}
        onAdded={() => {
          reload()
          publicLibrary.collections().then(setCollections).catch(() => {})
        }}
      />

      {items === null ? (
        <div className="text-sm text-paper-50/50">загрузка…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-50/15 p-8 text-center text-paper-50/50">
          в этом разделе пока ничего нет
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li
              key={item.id}
              className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-paper-50/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-paper-50/50">
                      {KIND_LABEL[item.kind]}
                    </span>
                    <span className="truncate text-paper-50">{item.title}</span>
                  </div>
                  {item.summary && (
                    <div className="mt-1 line-clamp-2 text-xs text-paper-50/45">
                      {item.summary}
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-paper-50/40">
                    {item.kind === 'link' && <span className="truncate">{item.url}</span>}
                    {item.kind === 'file' && item.file_url && (
                      <a
                        href={`${fileUrl(item.file_url)}?preview=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-paper-50/20 underline-offset-2 hover:text-paper-50"
                      >
                        {item.file_name}
                      </a>
                    )}
                    {item.material_status && <IndexBadge item={item} />}
                    <span>{item.views} просмотров</span>
                    {item.is_published && (
                      <a
                        href={`/library/${item.collection}/${item.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-paper-50/20 underline-offset-2 hover:text-paper-50"
                      >
                        страница
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {item.is_published ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      на сайте
                    </span>
                  ) : (
                    <span className="text-xs text-paper-50/40">черновик</span>
                  )}
                  <div className="flex items-center gap-1">
                    <IconButton
                      label="выше"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      label="ниже"
                      disabled={i === items.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </IconButton>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-paper-50/8 pt-3">
                <button
                  onClick={() => setView({ mode: 'edit', item })}
                  className="rounded-lg border border-paper-50/15 px-3 py-1.5 text-xs text-paper-50/70 transition hover:border-paper-50/30 hover:text-paper-50"
                >
                  править
                </button>
                <button
                  onClick={() =>
                    act(() =>
                      item.is_published
                        ? adminLibrary.unpublish(token, item.id)
                        : adminLibrary.publish(token, item.id),
                    )
                  }
                  className="rounded-lg border border-paper-50/15 px-3 py-1.5 text-xs text-paper-50/70 transition hover:border-paper-50/30 hover:text-paper-50"
                >
                  {item.is_published ? 'снять с сайта' : 'опубликовать'}
                </button>
                <button
                  onClick={() => {
                    const extra = item.material_id
                      ? ' Файл пропадёт и из материалов — тест по нему больше не сгенерировать.'
                      : ''
                    if (!confirm(`Удалить «${item.title}»?${extra}`)) return
                    act(() => adminLibrary.delete(token, item.id))
                  }}
                  className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300/70 transition hover:text-red-300"
                >
                  удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const INDEX_LABEL: Record<MaterialStatus, string> = {
  pending: 'в очереди на индексацию',
  indexing: 'индексируется…',
  ready: 'в источниках генерации',
  failed: 'индексация не удалась',
}

function IndexBadge({ item }: { item: LibraryItemDTO }) {
  const status = item.material_status as MaterialStatus
  const color =
    status === 'ready'
      ? 'text-emerald-300/80'
      : status === 'failed'
        ? 'text-red-300/80'
        : 'text-amber-300/80'
  return (
    <span className={color}>
      {INDEX_LABEL[status]}
      {status === 'ready' && item.chunks_count > 0 ? ` · ${item.chunks_count} чанков` : ''}
    </span>
  )
}

function IconButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-paper-50/10 px-2 py-0.5 text-xs text-paper-50/60 transition hover:border-paper-50/30 hover:text-paper-50 disabled:opacity-25 disabled:hover:border-paper-50/10"
    >
      {children}
    </button>
  )
}

const MAX_MB = 60

/** Добавление материала: три формы под три вида, переключаются вкладками. */
function AddPanel({
  token,
  collection,
  onAdded,
}: {
  token: string
  collection: string
  onAdded: () => void
}) {
  const [kind, setKind] = useState<LibraryKind>('article')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooBig = !!file && file.size > MAX_MB * 1024 * 1024
  const blocker = !title.trim()
    ? 'впиши название'
    : kind === 'article' && !body.trim()
      ? 'напиши текст статьи'
      : kind === 'link' && !url.trim()
        ? 'вставь ссылку'
        : kind === 'file' && !file
          ? 'выбери файл'
          : tooBig
            ? `файл больше ${MAX_MB} МБ`
            : null

  function reset() {
    setTitle('')
    setSummary('')
    setBody('')
    setUrl('')
    setFile(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (blocker) return
    setBusy(true)
    setError(null)
    try {
      if (kind === 'file' && file) {
        await adminLibrary.upload(token, {
          collection,
          title: title.trim(),
          summary: summary.trim(),
          file,
        })
      } else {
        await adminLibrary.create(token, {
          collection,
          kind: kind === 'article' ? 'article' : 'link',
          title: title.trim(),
          summary: summary.trim(),
          body_md: body,
          url: url.trim(),
        })
      }
      reset()
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось добавить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6"
    >
      <div className="flex flex-wrap gap-2">
        {(['article', 'link', 'file'] as LibraryKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k)
              setError(null)
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              kind === k
                ? 'border-paper-50/40 bg-paper-50/5 text-paper-50'
                : 'border-paper-50/10 text-paper-50/50 hover:text-paper-50/80'
            }`}
          >
            {k === 'article' ? 'своя статья' : k === 'link' ? 'ссылка' : 'файл'}
          </button>
        ))}
      </div>

      <Field label="название">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: Почему мост не падает"
          className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40"
        />
      </Field>

      <Field label="короткое описание — его видно на карточке">
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Одна фраза о том, зачем это открывать"
          className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40"
        />
      </Field>

      {kind === 'article' && (
        <Field label="текст статьи">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder={
              '## Подзаголовок\nАбзац текста. Формулы как обычно: $a^2 + b^2 = c^2$.\n\n- пункт списка\n- ещё пункт\n\nСсылка: [текст](https://example.ru) или просто https://example.ru'
            }
            className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 font-mono text-sm text-paper-50 outline-none focus:border-paper-50/40"
          />
          <p className="mt-1 text-xs text-paper-50/40">
            Пустая строка — новый абзац. «## » — подзаголовок, «- » — список,
            «&gt; » — цитата. Формулы в долларах, ссылки вставляются как есть.
          </p>
        </Field>
      )}

      {kind === 'link' && (
        <>
          <Field label="ссылка">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40"
            />
          </Field>
          <Field label="заметка — необязательно">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Зачем идти по ссылке и что там смотреть"
              className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 text-sm text-paper-50 outline-none focus:border-paper-50/40"
            />
            <p className="mt-1 text-xs text-paper-50/40">
              Есть заметка — карточка ведёт на страницу материала, где и текст,
              и кнопка перехода. Нет — сразу наружу.
            </p>
          </Field>
        </>
      )}

      {kind === 'file' && (
        <Field label="файл">
          <input
            type="file"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null
              setFile(picked)
              if (picked && !title.trim()) {
                setTitle(picked.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim())
              }
            }}
            className="w-full text-sm text-paper-50/80 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-paper-50/10 file:px-4 file:py-2 file:text-paper-50"
          />
          {file && (
            <p className={`mt-1 text-xs ${tooBig ? 'text-amber-300/90' : 'text-paper-50/40'}`}>
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} МБ
              {tooBig && ` — больше ${MAX_MB} МБ, сервер не примет`}
            </p>
          )}
          <p className="mt-1 text-xs text-paper-50/40">
            PDF после загрузки индексируется и появляется в списке источников
            на вкладках «Тесты» и «Задача недели». Остальные форматы (docx,
            pptx, картинки, архивы) просто лежат как вложение: текст из них
            мы не достаём, в генерации они не участвуют.
          </p>
        </Field>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400/90">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !!blocker}
          className="rounded-lg bg-paper-50 px-4 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
        >
          {busy ? 'добавляем…' : 'добавить в раздел'}
        </button>
        {blocker && !busy && (
          <span className="text-xs text-paper-50/50">Кнопка ждёт: {blocker}.</span>
        )}
      </div>
      <p className="text-xs text-paper-50/40">
        Материал появляется как черновик — на сайте его пока не видно. Публикуй
        кнопкой в списке, когда всё готово.
      </p>
    </form>
  )
}

/** Правка готового материала. Файл не меняем: проще удалить и загрузить заново. */
function ItemEditor({
  token,
  item,
  onCancel,
  onDone,
}: {
  token: string
  item: LibraryItemDTO
  onCancel: () => void
  onDone: () => void
}) {
  const [title, setTitle] = useState(item.title)
  const [summary, setSummary] = useState(item.summary)
  const [body, setBody] = useState(item.body_md)
  const [url, setUrl] = useState(item.url)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await adminLibrary.update(token, item.id, {
        title: title.trim(),
        summary: summary.trim(),
        body_md: body,
        url: url.trim(),
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-serif text-lg text-paper-50">{KIND_LABEL[item.kind]}</h2>
        <button
          onClick={onCancel}
          className="rounded-lg border border-paper-50/20 px-3 py-1.5 text-sm text-paper-50/70 transition hover:text-paper-50"
        >
          ← назад
        </button>
      </div>

      <Field label="название">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40"
        />
        <p className="mt-1 text-xs text-paper-50/40">
          Адрес страницы собран из названия — поменяешь его, и старая ссылка
          перестанет открываться.
        </p>
      </Field>

      <Field label="короткое описание">
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40"
        />
      </Field>

      {item.kind === 'link' && (
        <Field label="ссылка">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40"
          />
        </Field>
      )}

      {item.kind === 'file' && item.file_url && (
        <div className="rounded-lg border border-paper-50/10 bg-ink-950/50 px-3 py-2 text-xs text-paper-50/50">
          файл:{' '}
          <a
            href={`${fileUrl(item.file_url)}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-paper-50/20 underline-offset-2 hover:text-paper-50"
          >
            {item.file_name}
          </a>
          . Чтобы заменить файл — удали материал и загрузи заново.
        </div>
      )}

      <Field label={item.kind === 'article' ? 'текст статьи' : 'заметка'}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={item.kind === 'article' ? 16 : 6}
          className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2 font-mono text-sm text-paper-50 outline-none focus:border-paper-50/40"
        />
      </Field>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400/90">
          {error}
        </div>
      )}

      <button
        onClick={save}
        disabled={busy || !title.trim()}
        className="rounded-lg bg-paper-50 px-4 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
      >
        {busy ? 'сохраняем…' : 'сохранить'}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wider text-paper-50/60">{label}</span>
      {children}
    </label>
  )
}
