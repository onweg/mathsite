import { useEffect, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { fileUrl } from '../../lib/api'
import { AnalyticsReport, getAnalytics, PAGE_LABELS } from '../../lib/analytics'
import { Overview } from './analytics/Overview'
import { dateTime, duration, percent, ReportTable } from './analytics/ReportTable'

type Screen = 'overview' | 'students' | 'quizzes' | 'weekly' | 'content' | 'polls'
const SCREENS: [Screen, string][] = [
  ['overview', 'Обзор'], ['students', 'Ученики'], ['quizzes', 'Тесты'],
  ['weekly', 'Задачи недели'], ['content', 'Разделы и материалы'], ['polls', 'Опросы'],
]
const STATUS = { new: 'Ждёт проверки', correct: 'Верно', partial: 'Частично', wrong: 'Неверно' }
const ACTION: Record<string, string> = { section: 'Вход в раздел', open: 'Чтение статьи', file: 'Открытие файла', link: 'Переход по ссылке' }
const CONTROL = 'rounded-lg border border-paper-50/15 bg-ink-900 px-3 py-2 text-sm text-paper-50 outline-none focus:border-gold-500/60'

function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map((type) => parts.find((p) => p.type === type)?.value).join('-')
}
function daysAgo(days: number): string {
  return new Date(Date.parse(`${today()}T12:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10)
}

export default function StatisticsPage({ token }: { token: string }) {
  const [screen, setScreen] = useState<Screen>('overview')
  const [start, setStart] = useState(() => daysAgo(30))
  const [end, setEnd] = useState(today)
  const [classLabel, setClassLabel] = useState('__all__')
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('activity')
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<AnalyticsReport | null>(null)
  const [classes, setClasses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const invalid = !end || (start && start > end) || end > today()

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    if (invalid) { setLoading(false); return }
    setLoading(true)
    const timer = window.setTimeout(() => {
      getAnalytics(token, {
        start: start || undefined, end, class_label: classLabel === '__all__' ? undefined : classLabel,
        student_id: student?.id,
      }).then((report) => {
        if (!cancelled) { setData(report); setClasses(report.classes) }
      }).catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить статистику')
      }).finally(() => { if (!cancelled) setLoading(false) })
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [token, start, end, classLabel, student?.id, revision, invalid])

  function chooseStudent(id: string, name: string) {
    setStudent({ id, name }); setSearch(''); setScreen('overview')
  }
  const match = (...values: (string | null)[]) => values.some((v) => v?.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')))
  const person = (id: string | null, name: string, label: string) => <div className="min-w-32">
    {id ? <button className="text-left text-paper-50 hover:text-gold-500 underline decoration-paper-50/20 underline-offset-4" onClick={() => chooseStudent(id, name)}>{name}</button> : <span>{name || 'Без входа'}</span>}
    <div className="mt-1 text-xs text-paper-50/35">{id ? label || 'Без класса' : 'Без привязки к ученику'}</div>
  </div>
  const tableKey = `${screen}:${start}:${end}:${classLabel}:${student?.id}:${search}:${sort}`
  const sortedStudents = [...(data?.students ?? [])].filter((s) => match(s.name, s.class_label)).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ru')
    if (sort === 'visits') return b.visits - a.visits
    if (sort === 'time') return b.active_seconds - a.active_seconds
    if (sort === 'quizzes') return b.quiz_attempts - a.quiz_attempts
    return (b.last_activity ?? '').localeCompare(a.last_activity ?? '')
  })

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="font-serif text-3xl">Статистика</h2><p className="mt-2 text-sm text-paper-50/45">Посещения, учебные результаты и интерес к материалам.</p></div>
      <button className={`${CONTROL} disabled:opacity-40`} disabled={loading || !!invalid} onClick={() => setRevision((v) => v + 1)}>Обновить</button>
    </div>

    <div className="space-y-4 rounded-xl border border-paper-50/10 bg-ink-900/20 p-4">
      <div className="flex flex-wrap gap-2">
        {[7, 30, 90, 0].map((days) => {
          const active = start === (days ? daysAgo(days) : '') && end === today()
          return <button key={days} onClick={() => { setStart(days ? daysAgo(days) : ''); setEnd(today()) }} className={`rounded-full border px-3 py-1.5 text-xs ${active ? 'border-gold-500/50 text-gold-500 bg-gold-500/10' : 'border-paper-50/10 text-paper-50/50 hover:text-paper-50'}`}>{days ? `${days} дней` : 'Всё время'}</button>
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-paper-50/45"><span className="block">С даты</span><input aria-label="Начало периода" type="date" max={end || today()} value={start} onChange={(e) => setStart(e.target.value)} className={CONTROL} style={{ colorScheme: 'dark' }} /></label>
        <label className="space-y-1 text-xs text-paper-50/45"><span className="block">По дату включительно</span><input aria-label="Конец периода" type="date" max={today()} value={end} onChange={(e) => setEnd(e.target.value)} className={CONTROL} style={{ colorScheme: 'dark' }} /></label>
        <label className="space-y-1 text-xs text-paper-50/45"><span className="block">Класс</span><select className={CONTROL} value={classLabel} onChange={(e) => { setClassLabel(e.target.value); setStudent(null) }}>
          <option value="__all__">Все классы и гости</option>
          {classes.map((c) => <option key={c} value={c}>{c || 'Без класса'}</option>)}
        </select></label>
        {student && <button onClick={() => setStudent(null)} className="rounded-full border border-gold-500/30 px-3 py-2 text-sm text-gold-500" title="Сбросить фильтр по ученику">{student.name} ×</button>}
      </div>
      {!!invalid && <p role="alert" className="text-sm text-red-300">Укажи корректный период до сегодняшнего дня.</p>}
      <p className="text-xs text-paper-50/35">Все вкладки ниже используют этот период и фильтры. Нажми на имя ученика, чтобы посмотреть только его данные.</p>
    </div>

    <div className="flex gap-2 overflow-x-auto border-b border-paper-50/10" role="tablist" aria-label="Виды статистики">
      {SCREENS.map(([id, label]) => <button key={id} role="tab" aria-selected={screen === id} onClick={() => { setScreen(id); setSearch('') }} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${screen === id ? 'border-gold-500 text-gold-500' : 'border-transparent text-paper-50/45 hover:text-paper-50'}`}>{label}</button>)}
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error} <button className="ml-3 underline" onClick={() => setRevision((v) => v + 1)}>Повторить</button></div>}
    {loading && <div className="py-16 text-center text-sm text-paper-50/45" role="status">Собираем статистику…</div>}
    {data && !loading && <>
      {screen !== 'overview' && <div className="flex flex-wrap gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск в статистике" placeholder="Поиск по имени или названию…" className={`${CONTROL} min-w-64 flex-1`} />
        {screen === 'students' && <select aria-label="Сортировка учеников" value={sort} onChange={(e) => setSort(e.target.value)} className={CONTROL}>
          <option value="activity">По последней активности</option><option value="visits">По числу визитов</option><option value="time">По времени на сайте</option><option value="quizzes">По попыткам тестов</option><option value="name">По имени</option>
        </select>}
      </div>}

      {screen === 'overview' && <Overview data={data} start={start} end={end} />}
      {screen === 'students' && <>
        <p className="text-xs text-paper-50/40">Здесь также видны ученики без активности. Последняя активность включает решения, ответы и просмотры; последний визит — только новый счётчик посещений.</p>
        <ReportTable key={tableKey} headers={['Ученик', 'Визиты', 'На сайте', 'Последний визит', 'Последняя активность', 'Тесты / средний балл', 'Задачи / верно', 'Библиотека', 'Опросы']} rows={sortedStudents.map((s) => ({ key: s.id, cells: [
          person(s.id, s.name, s.class_label), s.visits, duration(s.active_seconds), dateTime(s.last_visit),
          <div className="min-w-36">{dateTime(s.last_activity)}{s.last_seen && Date.now() - Date.parse(s.last_seen) < 90_000 && <div className="mt-1 text-xs text-sage-500">Активность менее 2 мин назад</div>}</div>,
          `${s.quiz_attempts} / ${percent(s.average_score)}`, `${s.weekly_submissions} / ${s.weekly_correct}`, s.library_views, s.poll_answers,
        ] }))} />
      </>}
      {screen === 'quizzes' && <ReportTable key={tableKey} headers={['Тест', 'Ученик', 'Попыток', 'Лучший', 'Средний', 'Последний результат', 'Последняя попытка']} rows={data.quizzes.filter((r) => match(r.title, r.student_name, r.class_label)).map((r, i) => ({ key: `${r.quiz_id}:${r.student_id}:${i}`, cells: [r.title, person(r.student_id, r.student_name, r.class_label), <span className="font-mono text-gold-500">{r.attempts}</span>, percent(r.best_score), percent(r.average_score), `${r.last_score} / ${r.last_total}`, dateTime(r.last_attempt)] }))} />}
      {screen === 'weekly' && <>
        <p className="text-xs text-paper-50/40">Показаны сохранённые решения и текущая оценка учителя. Повторная отправка заменяет прежнее решение; история его версий ранее не сохранялась.</p>
        <ReportTable key={tableKey} headers={['Задача', 'Ученик', 'Проверка', 'Решение', 'Отправлено']} rows={data.weekly.filter((r) => match(r.title, r.student_name, r.class_label)).map((r) => ({ key: r.id, cells: [r.title, person(r.student_id, r.student_name, r.class_label), <div className="min-w-32"><span className={r.status === 'correct' ? 'text-sage-500' : r.status === 'new' ? 'text-gold-500' : 'text-paper-50/70'}>{STATUS[r.status]}</span>{r.teacher_comment && <p className="mt-2 text-xs text-paper-50/45">{r.teacher_comment}</p>}{r.reviewed_at && <p className="mt-1 text-xs text-paper-50/35">{dateTime(r.reviewed_at)}</p>}</div>,
          <details className="min-w-36"><summary className="cursor-pointer text-gold-500">Посмотреть</summary><div className="mt-3 min-w-64 max-w-lg">{r.solution_md && <Markdown text={r.solution_md} />}{r.image_filename && <a className="mt-2 block text-gold-500 underline" href={fileUrl(`/weekly/images/${encodeURIComponent(r.image_filename)}`)} target="_blank" rel="noreferrer">Открыть фото решения ↗</a>}</div></details>, dateTime(r.created_at)] }))} />
      </>}
      {screen === 'content' && <>
        <p className="text-xs text-paper-50/40">Для просмотра интересов конкретного ученика выбери его на вкладке «Ученики». Повторные открытия библиотеки учитываются по существующим правилам: одинаковое действие ученика в течение 15 минут не дублируется.</p>
        <ReportTable key={tableKey} headers={['Раздел', 'Материал', 'Действие', 'Открытий', 'Учеников', 'Последний просмотр']} rows={data.content.filter((r) => match(r.title, PAGE_LABELS[r.collection])).map((r) => ({ key: `${r.collection}:${r.item_id}:${r.action}`, cells: [PAGE_LABELS[r.collection] ?? r.collection, r.title, ACTION[r.action] ?? r.action, r.views, r.students, dateTime(r.last_view)] }))} />
      </>}
      {screen === 'polls' && <ReportTable key={tableKey} headers={['Опрос', 'Ученик', 'Ответ', 'Комментарий', 'Дата']} rows={data.polls.filter((r) => match(r.title, r.student_name, r.class_label)).map((r) => ({ key: r.id, cells: [r.title, person(r.student_id, r.student_name, r.class_label), r.choices || '—', <p className="max-w-md whitespace-pre-wrap">{r.comment || '—'}</p>, dateTime(r.created_at)] }))} />}

      <details className="rounded-xl border border-paper-50/10 p-4 text-xs text-paper-50/45">
        <summary className="cursor-pointer">Как считаются показатели</summary>
        <div className="mt-3 space-y-2 leading-relaxed">
          <p>Посещения и время начали собираться {data.tracking_since ? dateTime(data.tracking_since) : 'после обновления — первых посещений ещё нет'}. Старые результаты тестов, решения и просмотры библиотеки доступны за прошлые периоды.</p>
          <p>Визит объединяет активность в одном браузере до перерыва в 30 минут. Время считается в видимой активной вкладке и приостанавливается через 2 минуты без действий. Это оценка вовлечённости, а не точный секундомер.</p>
          <p>Посещение засчитывается после открытия раздела. Ученики определяются по QR-входу; анонимные визиты не приписываются именам. Визиты с разных устройств считаются отдельно. Публичные просмотры из браузера с сохранённым входом учителя исключены из нового счётчика.</p>
          <p>Фильтр дат применяется по дате открытия или первоначальной отправки записи. У задач и опросов отображается текущая версия ответа. Время, даты и границы дней — московские. Данные хранятся на вашем сервере.</p>
        </div>
      </details>
    </>}
  </div>
}
