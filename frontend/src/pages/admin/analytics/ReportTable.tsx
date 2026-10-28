import { ReactNode, useState } from 'react'

export function ReportTable({ headers, rows, empty = 'За выбранный период данных нет.' }: {
  headers: string[]; rows: { key: string; cells: ReactNode[] }[]; empty?: string
}) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / 25))
  const current = Math.min(page, pages - 1)
  if (!rows.length) return <div className="rounded-xl border border-dashed border-paper-50/15 p-10 text-center text-sm text-paper-50/50">{empty}</div>
  return (
    <div className="overflow-hidden rounded-xl border border-paper-50/10 bg-ink-900/20">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper-50/[0.03] text-[10px] uppercase tracking-wider text-paper-50/45">
            <tr>{headers.map((h) => <th key={h} scope="col" className="px-4 py-3 font-normal whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-paper-50/5">
            {rows.slice(current * 25, current * 25 + 25).map((row) => (
              <tr key={row.key} className="align-top hover:bg-paper-50/[0.025]">
                {row.cells.map((cell, i) => <td key={i} className="px-4 py-3 text-paper-50/80">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-paper-50/10 px-4 py-3 text-xs text-paper-50/45">
        <span>{current * 25 + 1}–{Math.min(rows.length, (current + 1) * 25)} из {rows.length}</span>
        {pages > 1 && <div className="flex items-center gap-3">
          <button disabled={current === 0} onClick={() => setPage(current - 1)} className="disabled:opacity-30 hover:text-paper-50">← Назад</button>
          <span>{current + 1} / {pages}</span>
          <button disabled={current === pages - 1} onClick={() => setPage(current + 1)} className="disabled:opacity-30 hover:text-paper-50">Далее →</button>
        </div>}
      </div>
    </div>
  )
}

export function duration(seconds: number): string {
  if (!seconds) return '0 мин'
  if (seconds < 60) return '< 1 мин'
  const minutes = Math.floor(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` : `${minutes} мин`
}

export function dateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }) : '—'
}

export function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`
}
