import { useRef, useState } from 'react'
import type { MaterialPublicDTO, Topic } from '../lib/api'

export type MaterialSelection =
  | { kind: 'topic'; value: Topic }
  | { kind: 'material'; source_key: string; title: string }

export function selectionLabel(s: MaterialSelection): string {
  if (s.kind === 'material') return s.title
  return s.value === 'algebra'
    ? 'Учебник алгебры 8 класса, Макарычев'
    : 'Учебник геометрии 7–9, Атанасян'
}

const keyOf = (s: MaterialSelection) => s.kind === 'topic' ? s.value : s.source_key

export function MaterialPicker({ selection, materials, onChange, disabled }: {
  selection: MaterialSelection
  materials: MaterialPublicDTO[]
  onChange: (value: MaterialSelection) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('title')
  const trigger = useRef<HTMLButtonElement>(null)
  const options: MaterialSelection[] = [
    ...materials.filter(m => m.chunks_count > 0).map(m => ({
      kind: 'material' as const, source_key: m.source_key, title: m.title,
    })),
    { kind: 'topic', value: 'algebra' }, { kind: 'topic', value: 'geometry' },
  ]
  const normalize = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е')
  const words = normalize(search).split(/\s+/).filter(Boolean)
  const visible = options.filter(s =>
    (filter === 'all' || s.kind === filter) && words.every(w => normalize(selectionLabel(s)).includes(w)),
  )
  if (sort !== 'recent') visible.sort((a, b) =>
    selectionLabel(a).localeCompare(selectionLabel(b), 'ru', { numeric: true }) * (sort === 'title' ? 1 : -1))

  const close = () => { setOpen(false); trigger.current?.focus() }
  const field = 'w-full min-w-0 rounded-lg border border-paper-50/20 bg-ink-950 px-3 py-2 text-sm text-paper-50'
  return (
    <div className="min-w-0" onKeyDown={e => { if (e.key === 'Escape') close() }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-paper-50/50">Выбранный источник</p>
          <p className="break-words text-paper-50">{selectionLabel(selection)}</p>
        </div>
        <button ref={trigger} type="button" disabled={disabled} aria-expanded={open} aria-controls="material-picker-list"
          onClick={() => setOpen(!open)} className="rounded-lg border border-paper-50/20 px-4 py-2 text-sm disabled:opacity-50">
          {open ? 'Скрыть список' : 'Сменить материал'}
        </button>
      </div>
      {open && <div id="material-picker-list" className="mt-4 space-y-3 rounded-xl border border-paper-50/15 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="min-w-0 space-y-1 text-xs text-paper-50/70">Поиск материала
            <input autoFocus type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Название, автор, класс" className={field} />
          </label>
          <label className="space-y-1 text-xs text-paper-50/70">Источники
            <select aria-label="Источники" value={filter} onChange={e => setFilter(e.target.value)} className={field}>
              <option value="all">Все источники</option><option value="material">Материалы учителя</option>
              <option value="topic">Базовые учебники</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-paper-50/70">Порядок материалов
            <select aria-label="Порядок материалов" value={sort} onChange={e => setSort(e.target.value)} className={field}>
              <option value="title">По названию: А–Я</option><option value="reverse">По названию: Я–А</option>
              <option value="recent">Сначала новые</option>
            </select>
          </label>
        </div>
        <p role="status" className="text-xs text-paper-50/50">Найдено: {visible.length} из {options.length}</p>
        <div role="radiogroup" aria-label="Материал для вопроса" className="max-h-64 overflow-y-auto overscroll-contain">
          {visible.map(s => <label key={keyOf(s)} className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-paper-50/5">
            <input type="radio" name="rag-material" checked={keyOf(selection) === keyOf(s)} disabled={disabled}
              onChange={() => { onChange(s); close() }} className="mt-1 accent-[#d3a675]" />
            <span className="min-w-0 break-words text-sm">{selectionLabel(s)}</span>
          </label>)}
          {visible.length === 0 && <p className="p-3 text-sm text-paper-50/60">Материалы не найдены. Измените поиск или фильтр.</p>}
        </div>
      </div>}
    </div>
  )
}
