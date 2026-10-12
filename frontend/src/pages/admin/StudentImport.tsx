import { useRef, useState } from 'react'
import { ImportResultDTO, adminStudents } from '../../lib/api'

type Mode = 'single' | 'text' | 'csv' | 'xlsx'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'single', label: 'Один', hint: 'добавить одного ученика' },
  { id: 'text', label: 'Список', hint: 'вставить список текстом' },
  { id: 'csv', label: 'CSV', hint: 'загрузить .csv' },
  { id: 'xlsx', label: 'Excel', hint: 'загрузить .xlsx' },
]

export function StudentImport({
  token,
  onDone,
}: {
  token: string
  onDone: () => void
}) {
  const [mode, setMode] = useState<Mode>('text')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResultDTO | null>(null)

  // поля формы
  const [name, setName] = useState('')
  const [cls, setCls] = useState('')
  const [note, setNote] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [defaultCls, setDefaultCls] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      if (mode === 'single') {
        if (!name.trim()) throw new Error('пустое имя')
        await adminStudents.create(token, {
          name: name.trim(),
          class_label: cls.trim(),
          note: note.trim() || null,
        })
        setName('')
        setNote('')
        setResult({ created: 1, skipped_duplicates: 0, errors: [] })
      } else if (mode === 'text') {
        if (!bulkText.trim()) throw new Error('пустой список')
        const r = await adminStudents.bulkText(token, {
          text: bulkText,
          default_class_label: defaultCls.trim(),
        })
        setResult(r)
        setBulkText('')
      } else {
        if (!file) throw new Error('файл не выбран')
        const r = await adminStudents.bulkFile(token, mode, file, defaultCls.trim())
        setResult(r)
        setFile(null)
        if (fileRef.current) fileRef.current.value = ''
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка импорта')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6 space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMode(m.id)
              setResult(null)
              setError(null)
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition ${
              mode === m.id
                ? 'border-paper-50 bg-paper-50 text-ink-950'
                : 'border-paper-50/15 text-paper-50/60 hover:text-paper-50'
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="text-xs text-paper-50/40 ml-2">{MODES.find((m) => m.id === mode)?.hint}</span>
      </div>

      {mode === 'single' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="имя">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов Иван" className={input} />
          </Field>
          <Field label="класс">
            <input type="text" value={cls} onChange={(e) => setCls(e.target.value)} placeholder="8А" className={input} />
          </Field>
          <Field label="заметка (необязательно)" className="md:col-span-2">
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={input} />
          </Field>
        </div>
      )}

      {mode === 'text' && (
        <div className="space-y-3">
          <Field label="класс по умолчанию (можно пусто)">
            <input type="text" value={defaultCls} onChange={(e) => setDefaultCls(e.target.value)} placeholder="8А" className={`${input} max-w-[200px]`} />
          </Field>
          <Field label="список учеников (один на строку)">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              placeholder={`Иванов Иван\nПетров Пётр, 8Б\nСидорова Мария; 8А`}
              className={textarea}
            />
            <p className="text-[11px] text-paper-50/40 pt-1">
              разделители имя/класс: запятая, точка с запятой, вертикальная черта, табуляция.
            </p>
          </Field>
        </div>
      )}

      {(mode === 'csv' || mode === 'xlsx') && (
        <div className="space-y-3">
          <Field label="класс по умолчанию (можно пусто)">
            <input type="text" value={defaultCls} onChange={(e) => setDefaultCls(e.target.value)} placeholder="8А" className={`${input} max-w-[200px]`} />
          </Field>
          <Field label={`файл ${mode === 'csv' ? '.csv' : '.xlsx'}`}>
            <input
              ref={fileRef}
              type="file"
              accept={mode === 'csv' ? '.csv,text/csv' : '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-paper-50/80 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-paper-50/10 file:text-paper-50 file:cursor-pointer"
            />
            <p className="text-[11px] text-paper-50/40 pt-1">
              две колонки: имя · класс. Первая строка-заголовок распознаётся автоматически.
            </p>
          </Field>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm space-y-1 text-emerald-200">
          <div>
            добавлено: <b>{result.created}</b> · дубликатов пропущено: {result.skipped_duplicates}
          </div>
          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-300">
                ошибок: {result.errors.length} (развернуть)
              </summary>
              <ul className="mt-2 ml-4 text-xs text-amber-200/90 list-disc space-y-0.5">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    строка {e.line} · {e.source} — {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="bg-paper-50 text-ink-950 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? 'добавляем…' : 'добавить'}
      </button>
    </form>
  )
}

const input =
  'w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40'
const textarea =
  'w-full bg-ink-950/80 border border-paper-50/10 rounded-lg px-3 py-2 text-paper-50 outline-none focus:border-paper-50/40 font-mono text-sm'

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs uppercase tracking-wider text-paper-50/60">{label}</span>
      {children}
    </label>
  )
}
