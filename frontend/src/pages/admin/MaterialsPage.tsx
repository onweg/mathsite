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
    try {
      await adminMaterials.reindex(token, m.id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось переиндексировать')
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
        {materials === null ? (
          <div className="text-paper-50/50 text-sm">загрузка…</div>
        ) : materials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-paper-50/15 p-8 text-center text-paper-50/50">
            пока ничего не загружено
          </div>
        ) : (
          <ul className="space-y-2">
            {materials.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-paper-50 truncate">{m.title}</div>
                  <div className="text-xs text-paper-50/50 mt-0.5">
                    {m.chunks_count > 0 ? `${m.chunks_count} чанков · ` : ''}
                    <code className="font-mono">{m.source_key}</code>
                  </div>
                  {m.error_message && (
                    <div className="text-xs text-red-400/80 mt-1">
                      ошибка: {m.error_message}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={m.status} />
                  {m.status === 'failed' && (
                    <button
                      onClick={() => reindex(m)}
                      className="text-xs text-paper-50/70 hover:text-paper-50 border border-paper-50/15 rounded px-2 py-1"
                    >
                      ↻
                    </button>
                  )}
                  <button
                    onClick={() => remove(m)}
                    className="text-xs text-red-300/70 hover:text-red-300 border border-red-500/20 rounded px-2 py-1"
                  >
                    удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
