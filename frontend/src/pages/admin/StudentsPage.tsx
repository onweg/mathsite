import { useEffect, useMemo, useState } from 'react'
import { StudentDTO, adminStudents } from '../../lib/api'
import { StudentImport } from './StudentImport'

/**
 * Главная страница управления классом.
 * Содержит фильтр по классу, список учеников с токенами и формы импорта.
 * Кнопка «Печать» открывает отдельную страницу /admin/print?class=<label>
 * (её рендерит AdminRouter, см. PrintClassPage).
 */
export function StudentsPage({ token }: { token: string }) {
  const [students, setStudents] = useState<StudentDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filterClass, setFilterClass] = useState<string>('')

  async function reload() {
    try {
      setStudents(await adminStudents.list(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка загрузки')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const classes = useMemo(() => {
    if (!students) return [] as string[]
    const set = new Set<string>()
    students.forEach((s) => set.add(s.class_label))
    return Array.from(set).sort()
  }, [students])

  const filtered = useMemo(() => {
    if (!students) return [] as StudentDTO[]
    return filterClass ? students.filter((s) => s.class_label === filterClass) : students
  }, [students, filterClass])

  const grouped = useMemo(() => {
    const map = new Map<string, StudentDTO[]>()
    for (const s of filtered) {
      const key = s.class_label || '(без класса)'
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg text-paper-50 font-serif">Класс</h2>
        {classes.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterClass('')}
              className={filterBtn(filterClass === '')}
            >
              все
            </button>
            {classes.map((c) => (
              <button key={c} onClick={() => setFilterClass(c)} className={filterBtn(filterClass === c)}>
                {c || '—'}
              </button>
            ))}
          </div>
        )}
      </div>

      <StudentImport token={token} onDone={reload} />

      {error && (
        <div className="text-sm text-red-400/90 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {students === null ? (
        <div className="text-paper-50/50 text-sm">загрузка…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-paper-50/15 p-8 text-center text-paper-50/50">
          пока нет учеников. Добавь через форму выше.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([label, group]) => (
            <section key={label} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm uppercase tracking-widest text-paper-50/60">
                  {label} · {group.length} учеников
                </h3>
                <a
                  href={`/admin/print?class=${encodeURIComponent(label === '(без класса)' ? '' : label)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-paper-50/70 hover:text-paper-50 border border-paper-50/15 rounded px-3 py-1.5"
                >
                  Печать QR
                </a>
              </div>
              <ul className="space-y-2">
                {group.map((s) => (
                  <StudentRow key={s.id} token={token} student={s} onChange={reload} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function filterBtn(active: boolean): string {
  return [
    'rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-wider transition',
    active
      ? 'border-paper-50 bg-paper-50 text-ink-950'
      : 'border-paper-50/10 text-paper-50/60 hover:text-paper-50',
  ].join(' ')
}

/* --------- row --------- */

function StudentRow({
  token,
  student,
  onChange,
}: {
  token: string
  student: StudentDTO
  onChange: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const link = `${window.location.origin}/s/${student.qr_token}`

  async function regenerate() {
    if (!confirm('Старый токен и QR перестанут работать. Продолжить?')) return
    setBusy(true)
    try {
      await adminStudents.regenerate(token, student.id)
      await onChange()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Удалить ${student.name}? Привязанные попытки квизов станут анонимными.`)) return
    setBusy(true)
    try {
      await adminStudents.delete(token, student.id)
      await onChange()
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      /* ignore */
    }
  }

  return (
    <li className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-4 flex items-center gap-3 justify-between">
      <div className="min-w-0">
        <div className="text-paper-50 truncate">{student.name}</div>
        <div className="text-xs text-paper-50/40 mt-0.5 flex items-center gap-2">
          <code className="font-mono truncate max-w-[280px]">{link}</code>
          <button
            onClick={copyLink}
            className="text-paper-50/60 hover:text-paper-50 border border-paper-50/10 rounded px-1.5 py-0.5"
          >
            copy
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={regenerate}
          disabled={busy}
          className="text-xs text-paper-50/70 hover:text-paper-50 border border-paper-50/15 rounded px-2 py-1"
          title="перегенерировать токен"
        >
          новый токен
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="text-xs text-red-300/70 hover:text-red-300 border border-red-500/20 rounded px-2 py-1"
        >
          удалить
        </button>
      </div>
    </li>
  )
}
