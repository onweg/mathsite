import { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalyticsReport, PAGE_LABELS } from '../../../lib/analytics'
import { fileUrl } from '../../../lib/api'
import { dateTime, duration, percent } from './ReportTable'

export type PrintFilters = { start: string; end: string; classLabel: string; studentName?: string }

const STATUS = { new: 'Ждёт проверки', correct: 'Верно', partial: 'Частично', wrong: 'Неверно' }
const ACTION: Record<string, string> = { section: 'Вход в раздел', open: 'Чтение статьи', file: 'Открытие файла', link: 'Переход по ссылке' }
const date = (value: string) => value.split('-').reverse().join('.')
const person = (name: string, label: string, id: string | null) => `${name || 'Без входа'} · ${id ? label || 'Без класса' : 'Без привязки к ученику'}`

function Table({ title, headers, rows }: { title: string; headers: string[]; rows: ReactNode[][] }) {
  return <section>
    <h2>{title} <small>({rows.length})</small></h2>
    {rows.length ? <table>
      <thead><tr>{headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((cells, i) => <tr key={i}>{cells.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
    </table> : <p className="empty">За выбранный период данных нет.</p>}
  </section>
}

function PrintReport({ data, filters }: { data: AnalyticsReport; filters: PrintFilters }) {
  const t = data.totals
  const students = [...data.students].sort((a, b) => a.class_label.localeCompare(b.class_label, 'ru', { numeric: true }) || a.name.localeCompare(b.name, 'ru'))
  const totals = [
    ['Визиты', t.visits], ['Визиты без входа', t.anonymous_visits], ['Ученики на сайте', t.visitors],
    ['Открытия страниц', t.page_views], ['Активное время', duration(t.active_seconds)],
    ['Попытки тестов', t.quiz_attempts], ['Средний результат тестов', t.quiz_attempts ? percent(t.average_score) : '—'],
    ['Решения задач', t.weekly_submissions], ['Ждут проверки', t.weekly_pending],
    ['Открытия библиотеки', t.library_views], ['Ответы на опросы', t.poll_answers],
    ['Ученики без активности', data.students.filter(s => !s.last_activity).length],
  ]
  return <>
    <div className="toolbar">
      <button id="print-report" type="button">Печать / сохранить PDF</button>
      <button id="close-report" type="button">Закрыть</button>
      <span>Все разделы и строки за выбранный период. Поиск и страницы таблиц на экране не ограничивают отчёт.</span>
    </div>
    <main>
      <header>
        <h1>Статистика сайта · Mathematica</h1>
        <p><strong>Период:</strong> {filters.start ? `${date(filters.start)} — ${date(filters.end)}` : `Всё время по ${date(filters.end)}`} включительно.</p>
        <p><strong>Класс:</strong> {filters.classLabel === '__all__' ? 'Все классы и гости' : filters.classLabel || 'Без класса'}{filters.studentName && <> · <strong>Ученик:</strong> {filters.studentName}</>}</p>
        <p>Сформировано: {dateTime(new Date().toISOString())}. Даты и время — московские.</p>
      </header>
      <section aria-label="Сводка">
        <h2>Обзор</h2>
        <dl className="totals">{totals.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </section>
      <Table title="Посещения учеников" headers={['Ученик', 'Класс', 'Визиты', 'Активное время', 'Последний визит', 'Последнее присутствие', 'Последняя активность']} rows={students.map(s => [s.name, s.class_label || 'Без класса', s.visits, duration(s.active_seconds), dateTime(s.last_visit), dateTime(s.last_seen), dateTime(s.last_activity)])} />
      <Table title="Результаты учеников" headers={['Ученик', 'Класс', 'Попытки тестов', 'Средний результат', 'Решения задач / верно', 'Библиотека', 'Опросы']} rows={students.map(s => [s.name, s.class_label || 'Без класса', s.quiz_attempts, percent(s.average_score), `${s.weekly_submissions} / ${s.weekly_correct}`, s.library_views, s.poll_answers])} />
      <Table title="Тесты и попытки" headers={['Тест', 'Ученик / класс', 'Попыток', 'Лучший результат', 'Средний результат', 'Последний результат', 'Последняя попытка']} rows={data.quizzes.map(r => [r.title, person(r.student_name, r.class_label, r.student_id), r.attempts, percent(r.best_score), percent(r.average_score), `${r.last_score} / ${r.last_total}`, dateTime(r.last_attempt)])} />
      <Table title="Задачи недели" headers={['Задача', 'Ученик / класс', 'Проверка', 'Решение', 'Отправлено']} rows={data.weekly.map(r => [r.title, person(r.student_name, r.class_label, r.student_id), <>{STATUS[r.status]}{r.teacher_comment && <p>{r.teacher_comment}</p>}{r.reviewed_at && <p>Проверено: {dateTime(r.reviewed_at)}</p>}</>, <>{r.solution_md || 'Текст не приложен'}{r.image_filename && <p><a href={new URL(fileUrl(`/weekly/images/${encodeURIComponent(r.image_filename)}`), window.location.href).href}>Фото решения (доступно по ссылке в электронной версии отчёта)</a></p>}</>, dateTime(r.created_at)])} />
      <Table title="Разделы и материалы" headers={['Раздел', 'Материал', 'Действие', 'Открытий', 'Учеников', 'Последний просмотр']} rows={data.content.map(r => [PAGE_LABELS[r.collection] ?? r.collection, r.title, ACTION[r.action] ?? r.action, r.views, r.students, dateTime(r.last_view)])} />
      <Table title="Опросы" headers={['Опрос', 'Ученик / класс', 'Ответ', 'Комментарий', 'Дата']} rows={data.polls.map(r => [r.title, person(r.student_name, r.class_label, r.student_id), r.choices || '—', r.comment || '—', dateTime(r.created_at)])} />
      <Table title="Посещения разделов сайта" headers={['Страница', 'Открытий', 'Визитов', 'Учеников', 'Активное время']} rows={data.pages.map(r => [PAGE_LABELS[r.page] ?? r.page, r.views, r.visits, r.students, duration(r.active_seconds)])} />
      <Table title="Активность по дням" headers={['Дата', 'Визиты', 'Попытки тестов', 'Активное время']} rows={data.daily.map(r => [date(r.day), r.visits, r.attempts, duration(r.active_seconds)])} />
      <section className="notes">
        <h2>Как читать отчёт</h2>
        <p>Посещения и время начали собираться {data.tracking_since ? dateTime(data.tracking_since) : 'после обновления — первых посещений ещё нет'}. Старые результаты тестов, решения и просмотры библиотеки доступны за прошлые периоды.</p>
        <p>Визит объединяет активность в одном браузере до перерыва в 30 минут. Активное время учитывается в видимой вкладке и приостанавливается через 2 минуты без действий. Это оценка вовлечённости, а не точный секундомер.</p>
        <p>Ученики определяются по QR-входу. Анонимные визиты не приписываются именам. Визиты с разных устройств считаются отдельно. Последний визит — начало посещения, последнее присутствие — последний сигнал счётчика, последняя активность также включает результаты и просмотры.</p>
        <p>У задач и опросов показана текущая версия ответа; история заменённых решений не сохранялась. Даты фильтруются по открытию или первоначальной отправке записи. Повторные одинаковые действия ученика в библиотеке в течение 15 минут не дублируются. В таблице по дням перечислены дни, для которых есть данные.</p>
        <p>Это отчёт по собранным показателям. Рекомендации нейросети из вкладки «Анализ ИИ» сюда не включены.</p>
      </section>
    </main>
  </>
}

const STYLES = `
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; background: #fff; font: 10pt/1.4 Arial, sans-serif; }
  main { max-width: 273mm; margin: 24px auto; padding: 0 12px; }
  h1 { font-size: 20pt; margin: 0 0 12px; }
  h2 { font-size: 14pt; margin: 24px 0 10px; break-after: avoid; }
  small { font-size: 10pt; font-weight: normal; }
  p { margin: 5px 0; }
  .totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .totals div { border: 1px solid #aaa; padding: 10px; break-inside: avoid; }
  dt { font-size: 9pt; } dd { margin: 4px 0 0; font-size: 16pt; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9pt; }
  th, td { border: 1px solid #aaa; padding: 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
  th { background: #eee; font-weight: bold; }
  thead { display: table-header-group; } tr { break-inside: avoid; }
  a { color: #111; text-decoration: underline; }
  .notes { font-size: 9pt; } .empty { color: #555; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid #aaa; background: #f4f4f4; }
  button { padding: 10px 16px; cursor: pointer; font: inherit; }
  @media print { main { max-width: none; margin: 0; padding: 0; } .toolbar { display: none; } }
`

/** A separate, static document keeps pagination and the dark admin UI out of print. */
export function printAnalytics(data: AnalyticsReport, filters: PrintFilters): boolean {
  const html = '<!doctype html>' + renderToStaticMarkup(<html lang="ru"><head>
    <meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Статистика Mathematica — {date(filters.end)}</title><style>{STYLES}</style>
  </head><body><PrintReport data={data} filters={filters} /></body></html>)
  const popup = window.open('', '_blank')
  if (!popup) return false
  popup.opener = null
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  const print = () => { if (!popup.closed) { popup.focus(); popup.print() } }
  popup.document.getElementById('print-report')?.addEventListener('click', print)
  popup.document.getElementById('close-report')?.addEventListener('click', () => popup.close())
  popup.requestAnimationFrame(() => popup.requestAnimationFrame(print))
  return true
}
