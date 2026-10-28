import { AnalyticsReport, PAGE_LABELS } from '../../../lib/analytics'
import { duration, percent } from './ReportTable'

export function Overview({ data, start, end }: { data: AnalyticsReport; start: string; end: string }) {
  const t = data.totals
  const tiles = [
    ['Визиты', String(t.visits), `${t.anonymous_visits} без входа`],
    ['Ученики на сайте', String(t.visitors), 'вошедшие по QR'],
    ['Активное время', duration(t.active_seconds), 'суммарно за период'],
    ['Попытки тестов', String(t.quiz_attempts), `средний результат ${t.quiz_attempts ? percent(t.average_score) : '—'}`],
    ['Решения задач', String(t.weekly_submissions), `${t.weekly_pending} ждут проверки`],
    ['Библиотека', String(t.library_views), 'открытий разделов и материалов'],
    ['Ответы на опросы', String(t.poll_answers), 'сохранённых ответов'],
    ['Без активности', String(data.students.filter((s) => !s.last_activity).length), 'учеников в выбранном периоде'],
  ]
  const maxTime = Math.max(1, ...data.pages.map((p) => p.active_seconds))
  return <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(([label, value, sub]) => <div key={label} className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-4">
        <div className="text-[10px] uppercase tracking-wider text-paper-50/45">{label}</div>
        <div className="mt-2 font-mono text-2xl text-gold-500">{value}</div>
        <div className="mt-2 text-xs text-paper-50/40">{sub}</div>
      </div>)}
    </div>
    <DailyChart data={data.daily} start={start} end={end} />
    <section className="rounded-xl border border-paper-50/10 p-5">
      <h3 className="font-serif text-lg">Где проводят время</h3>
      <p className="mt-1 text-xs text-paper-50/40">Время активного просмотра, а не просто открытой вкладки.</p>
      {!data.pages.length && <p className="mt-5 text-sm text-paper-50/40">Пока нет данных о посещениях.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {data.pages.map((page) => <div key={page.page}>
          <div className="mb-2 flex justify-between gap-4 text-sm">
            <span>{PAGE_LABELS[page.page] ?? page.page}</span><span className="font-mono text-paper-50/50">{duration(page.active_seconds)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-paper-50/5"><div className="h-full rounded-full bg-gold-500/70" style={{ width: `${page.active_seconds / maxTime * 100}%` }} /></div>
          <div className="mt-1 text-[11px] text-paper-50/35">Открытий: {page.views} · визитов: {page.visits} · учеников: {page.students}</div>
        </div>)}
      </div>
    </section>
  </div>
}

function DailyChart({ data, start, end }: { data: AnalyticsReport['daily']; start: string; end: string }) {
  const finish = Date.parse(`${end}T00:00:00Z`)
  const begin = Math.max(Date.parse(`${start || data[0]?.day || end}T00:00:00Z`), finish - 365 * 86400000)
  const indexed = new Map(data.map((d) => [d.day, d]))
  const days = []
  for (let time = begin; time <= finish; time += 86400000) {
    const day = new Date(time).toISOString().slice(0, 10)
    days.push(indexed.get(day) ?? { day, visits: 0, attempts: 0, active_seconds: 0 })
  }
  const max = Math.max(1, ...days.flatMap((d) => [d.visits, d.attempts]))
  const width = Math.max(600, days.length * 22)
  const slot = (width - 40) / Math.max(1, days.length)
  return <section className="rounded-xl border border-paper-50/10 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-serif text-lg">Активность по дням</h3>
      <div className="flex gap-4 text-xs"><span className="text-gold-500">● Визиты</span><span className="text-sage-500">● Попытки тестов</span></div>
    </div>
    <p className="mt-1 text-xs text-paper-50/40">Дни по московскому времени. Для длинного периода показаны последние 366 дней.</p>
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${width} 180`} preserveAspectRatio="none" style={{ minWidth: days.length > 31 ? width : undefined, height: 180 }} className="w-full" role="img" aria-label="Визиты и попытки тестов по дням">
        <line x1="20" x2={width - 20} y1="145" y2="145" stroke="currentColor" className="text-paper-50/10" />
        {days.map((d, i) => {
          const x = 20 + i * slot
          return <g key={d.day}>
            <title>{d.day}: визитов {d.visits}, попыток {d.attempts}, активное время {duration(d.active_seconds)}</title>
            <rect x={x + 2} y={145 - d.visits / max * 120} width={slot * 0.35} height={d.visits / max * 120} rx="2" className="fill-gold-500/80" />
            <rect x={x + slot * 0.45} y={145 - d.attempts / max * 120} width={slot * 0.35} height={d.attempts / max * 120} rx="2" className="fill-sage-500/80" />
            {i % Math.max(1, Math.ceil(days.length / 12)) === 0 && <text x={x} y="166" fontSize="10" fill="currentColor" className="hidden text-paper-50/40 sm:block">{d.day.slice(8)}.{d.day.slice(5, 7)}</text>}
          </g>
        })}
      </svg>
    </div>
    <div className="flex justify-between text-[10px] text-paper-50/40 sm:hidden"><span>{days[0]?.day}</span><span>{days[days.length - 1]?.day}</span></div>
  </section>
}
