import { useEffect, useRef, useState } from 'react'
import { MaterialDTO, MaterialStatus, adminMaterials } from '../../lib/api'

const POLL_MS = 3000
//: столько принимает бэкенд (admin_materials.py); nginx на сервере пропускает 64m
const MAX_MB = 60

export function MaterialsPage({ token }: { token: string }) {
  const [materials, setMaterials] = useState<MaterialDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [reindexing, setReindexing] = useState<string | null>(null)
  const busy = (m: MaterialDTO) => m.status === 'pending' || m.status === 'indexing'
  const noContext = (m: MaterialDTO) => !busy(m) && m.chunks_count === 0
  const needsAttention = (m: MaterialDTO) => m.status === 'failed' || noContext(m)
  const attentionCount = materials?.filter(needsAttention).length ?? 0
  const words = search.toLocaleLowerCase('ru').replace(/ё/g, 'е').split(/\s+/).filter(Boolean)
  const visible = (materials ?? []).filter(m => {
    const title = m.title.toLocaleLowerCase('ru').replace(/ё/g, 'е')
    return words.every(w => title.includes(w)) && (
      filter === 'all' || (filter === 'attention' && needsAttention(m)) ||
      (filter === 'empty' && noContext(m)) || (filter === 'busy' && busy(m)) ||
      (filter === 'ready' && m.status === 'ready' && m.chunks_count > 0))
  })
  if (sort === 'title') visible.sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }))
  if (sort === 'context') visible.sort((a, b) => a.chunks_count - b.chunks_count)
  const fieldClass = 'w-full rounded-lg border border-paper-50/20 bg-ink-950 px-3 py-2 text-sm text-paper-50'


  const tooBig = !!file && file.size > MAX_MB * 1024 * 1024
  // почему кнопка не нажимается: раньше она просто была серой и молчала
  const blocker = !file
    ? 'выбери PDF'
    : !title.trim()
      ? 'впиши название — по нему материал будет виден в списке источников'
      : tooBig
        ? `файл ${mb(file.size)} — сервер принимает до ${MAX_MB} МБ`
        : null

  /** Выбрали файл: подставляем название из имени, если учитель его не вписал. */
  function pickFile(picked: File | null) {
    setFile(picked)
    setError(null)
    if (picked && !title.trim()) {
      setTitle(picked.name.replace(/\.pdf$/i, '').replace(/_+/g, ' ').trim())
    }
  }

  async function reload() {
    try {
      setMaterials(await adminMaterials.list(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка загрузки')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  // Пока есть материалы в pending/indexing — опрашиваем каждые 3 сек
  useEffect(() => {
    if (!materials) return
    const inProgress = materials.some((m) => m.status === 'pending' || m.status === 'indexing')
    if (!inProgress) return
    const t = setTimeout(reload, POLL_MS)
    return () => clearTimeout(t)
  }, [materials])

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !title.trim()) {
      setError('выбери файл и укажи название')
      return
    }
    setUploading(true)
    setError(null)
    try {
      await adminMaterials.upload(token, file, title.trim())
      setTitle('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось загрузить')
    } finally {
      setUploading(false)
    }
  }

  async function remove(m: MaterialDTO) {
    if (!confirm(`Удалить материал «${m.title}»? Чанки будут удалены из RAG.`)) return
    try {
      await adminMaterials.delete(token, m.id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось удалить')
    }
  }

  async function reindex(m: MaterialDTO) {
    if (reindexing) return
    setReindexing(m.id)
    setError(null)
    try {
      await adminMaterials.reindex(token, m.id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось переиндексировать')
    } finally {
      setReindexing(null)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg text-paper-50 font-serif">Материалы</h2>

      <form onSubmit={upload} className="rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6 space-y-4">
        <div className="text-sm uppercase tracking-widest text-paper-50/60">Загрузить PDF</div>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider text-paper-50/60">название</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Сборник задач ОГЭ 2026"
            className="w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider text-paper-50/60">PDF файл</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-paper-50/80 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-paper-50/10 file:text-paper-50 file:cursor-pointer"
          />
        </label>

        {file && (
          <p className={`text-xs ${tooBig ? 'text-amber-300/90' : 'text-paper-50/40'}`}>
            {file.name} · {mb(file.size)}
            {tooBig && ` — больше ${MAX_MB} МБ, сервер такой файл не примет`}
          </p>
        )}

        {error && (
          <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={uploading || !!blocker}
          className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {uploading ? 'грузим…' : 'загрузить и индексировать'}
        </button>
        {blocker && !uploading && (
          <p className="text-xs text-paper-50/50">Кнопка ждёт: {blocker}.</p>
        )}
        <p className="text-xs text-paper-50/40">
          После загрузки индексация идёт в фоне: учебник на пару сотен страниц —
          несколько минут, толстый сборник — заметно дольше. Статус обновляется автоматически.
        </p>
      </form>

      <div>
        <div className="text-sm uppercase tracking-widest text-paper-50/60 mb-3">Загруженные</div>
        <p className="mb-4 text-sm text-paper-50/60">
          Контекст — текст из PDF, по которому нейросеть может отвечать. Число фрагментов не гарантирует,
          что распознаны все страницы и формулы. Для сканов сначала нужен OCR — распознавание текста.
        </p>
        {attentionCount > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          Требуют внимания: {attentionCount}. Эти материалы недоступны в списке источников ученика.
          <button onClick={() => { setFilter('attention'); setSearch('') }} className="ml-2 underline">Показать проблемные</button>
        </div>}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-paper-50/70">Поиск загруженных материалов
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Название, автор, класс" className={fieldClass} />
          </label>
          <label className="space-y-1 text-xs text-paper-50/70">Состояние материала
            <select aria-label="Состояние материала" value={filter} onChange={e => setFilter(e.target.value)} className={fieldClass}>
              <option value="all">Все</option><option value="attention">Требуют внимания</option>
              <option value="empty">Нет контекста</option><option value="ready">Готовы к вопросам</option>
              <option value="busy">Обрабатываются</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-paper-50/70">Сортировка материалов
            <select aria-label="Сортировка материалов" value={sort} onChange={e => setSort(e.target.value)} className={fieldClass}>
              <option value="recent">Сначала новые</option><option value="title">По названию: А–Я</option>
              <option value="context">Сначала меньше контекста</option>
            </select>
          </label>
        </div>
        {materials && <p className="mb-3 text-xs text-paper-50/50">Показано: {visible.length} из {materials.length}</p>}
        {materials === null ? (
          <div className="text-paper-50/50 text-sm">загрузка…</div>
        ) : materials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-paper-50/15 p-8 text-center text-paper-50/50">
            пока ничего не загружено
          </div>
        ) : (
          <ul aria-label="Загруженные материалы" className="max-h-[65vh] space-y-2 overflow-y-auto overscroll-contain">
            {visible.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-paper-50 break-words">{m.title}</div>
                  <div className="text-xs text-paper-50/50 mt-0.5">
                    Контекст: {m.chunks_count} фрагментов для поиска
                  </div>
                  {noContext(m) && <p className="mt-2 text-sm text-amber-200">
                    Нет контекста: задавать вопросы по этому файлу пока нельзя.
                    Если текст в PDF выделяется, повторите обработку. Если нет — распознайте текст
                    и загрузите полученный PDF через форму выше.
                  </p>}
                  {m.status === 'failed' && m.chunks_count > 0 && <p className="mt-2 text-sm text-amber-200">
                    Предыдущие фрагменты сохранены, но последняя обработка не завершена. Повторите её.
                  </p>}
                  {m.error_message && (
                    <div className="break-words text-xs text-red-400/80 mt-1">
                      ошибка: {m.error_message}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {noContext(m) ? <span className="rounded border border-amber-500/40 px-2 py-1 text-xs text-amber-200">Нет контекста</span>
                    : <StatusBadge status={m.status} />}
                  {!busy(m) && (
                    <button
                      onClick={() => reindex(m)}
                      disabled={reindexing !== null}
                      className="text-xs text-paper-50/70 hover:text-paper-50 border border-paper-50/15 rounded px-2 py-1"
                    >
                      {reindexing === m.id ? 'Запускаем…' : 'Повторить обработку'}
                    </button>
                  )}
                  <button
                    onClick={() => remove(m)}
                    disabled={busy(m) || reindexing === m.id}
                    className="text-xs text-red-300/70 hover:text-red-300 border border-red-500/20 rounded px-2 py-1"
                  >
                    удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {materials && materials.length > 0 && visible.length === 0 && <p className="py-6 text-sm text-paper-50/60">По этим условиям материалы не найдены.</p>}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: MaterialStatus }) {
  const map: Record<MaterialStatus, { color: string; label: string }> = {
    pending: { color: 'text-paper-50/60 bg-paper-50/5 border-paper-50/15', label: 'в очереди' },
    indexing: { color: 'text-amber-300 bg-amber-500/10 border-amber-500/30', label: 'индексируется…' },
    ready: { color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', label: 'готов' },
    failed: { color: 'text-red-300 bg-red-500/10 border-red-500/30', label: 'ошибка' },
  }
  const s = map[status]
  return (
    <span className={`text-[11px] px-2 py-1 rounded border font-mono ${s.color}`}>{s.label}</span>
  )
}

/** Размер файла по-человечески. */
function mb(bytes: number): string {
  const value = bytes / 1024 / 1024
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} МБ`
}
