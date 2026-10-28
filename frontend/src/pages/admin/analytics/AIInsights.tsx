import { useEffect, useRef, useState } from 'react'
import { AnalyticsInsights, analyzeAnalytics } from '../../../lib/analytics'
import { dateTime, duration } from './ReportTable'

const METRICS: Record<string, string> = {
  visits: 'Визиты', visitors: 'Ученики', active_seconds: 'Активное время', quiz_attempts: 'Попытки тестов',
  library_events: 'Открытия библиотеки', weekly_submissions: 'Решения задач', poll_answers: 'Ответы на опросы',
  attempts: 'Все попытки', learners: 'Учеников по QR', anonymous_attempts: 'Анонимные попытки',
  average_score: 'Средний балл всех попыток', first_attempts: 'Первых попыток по QR',
  first_average_score: 'Средний балл первых попыток', repeat_attempts: 'Повторных попыток по QR',
  first_high_scores: 'С первого раза ≥80%', first_low_scores: 'С первого раза <50%',
  views: 'Открытия', readers: 'Учеников-читателей', article_opens: 'Открытия статьи', file_opens: 'Открытия файла',
  link_clicks: 'Переходы по ссылке', opens: 'Открытия раздела', submissions: 'Решения', pending: 'Не проверено',
  correct: 'Верно', partial: 'Частично', wrong: 'Неверно', answers: 'Ответы',
}
const GROUPS: Record<string, string> = { quizzes: 'Тесты', materials: 'Материалы', sections: 'Разделы', weekly: 'Задачи недели', polls: 'Опросы' }
const CONFIDENCE = { low: 'Предварительный вывод', medium: 'Умеренная уверенность', high: 'Высокая уверенность' }

export function AIInsights({ token, start, end }: { token: string; start: string; end: string }) {
  const [result, setResult] = useState<AnalyticsInsights | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  async function generate() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await analyzeAnalytics(token, start, end)
      if (alive.current) setResult(response)
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Не удалось получить анализ')
    } finally {
      inFlight.current = false
      if (alive.current) setBusy(false)
    }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border border-gold-500/25 bg-gold-500/[0.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="font-serif text-xl">Что стоит дать ученикам дальше</h3>
          <p className="mt-2 text-sm leading-relaxed text-paper-50/60">YandexGPT сравнит интерес к материалам и результаты тестов, выделит возможные сложности и предложит план действий для учителя.</p>
        </div>
        <button onClick={generate} disabled={busy} className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm text-gold-500 transition hover:bg-gold-500/20 disabled:opacity-40">
          {busy ? 'Анализируем…' : result ? 'Сформировать заново' : 'Сформировать анализ'}
        </button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-paper-50/45">Анализируется весь сайт за выбранные даты. Фильтры класса и ученика на этот отчёт не влияют. Для всей истории выбери «Всё время».</p>
      <details className="mt-3 text-xs leading-relaxed text-paper-50/50">
        <summary className="cursor-pointer text-paper-50/65">Какие данные получит нейросеть</summary>
        <p className="mt-2">Только числовые показатели: посещения и время, открытия материалов, первые и повторные попытки, баллы и количество проверенных решений. Материалы и тесты обозначаются условными кодами. Настоящие названия подставляются уже на нашем сервере.</p>
        <p className="mt-2">Имена, идентификаторы учеников, QR-ссылки, тексты ответов и комментариев, содержимое материалов и секретные ключи в сводку не входят. Обезличенные показатели отправляются в YandexGPT только по этой кнопке.</p>
      </details>
    </section>

    {busy && <div role="status" className="rounded-xl border border-paper-50/10 p-6 text-sm text-paper-50/60">Собираем обезличенную сводку и рекомендации. Это может занять около минуты.</div>}
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
    {result && <div className={`space-y-5 ${busy ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-paper-50/40">
        <span>Отчёт сформирован: {dateTime(result.generated_at)}</span>
        <span>{result.period.start || 'Вся история'} — {result.period.end}</span>
      </div>
      <section className="rounded-xl border border-paper-50/10 bg-ink-900/30 p-5">
        <h3 className="font-serif text-lg">Главные выводы</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-paper-50/75">{result.summary}</p>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {result.findings.map((finding, i) => <article key={`${finding.ref}:${i}`} className="rounded-xl border border-paper-50/10 p-5">
          <div className="text-[10px] uppercase tracking-wider text-gold-500/80">{CONFIDENCE[finding.confidence]}</div>
          <h4 className="mt-2 break-words font-serif text-lg">{finding.title}</h4>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-paper-50/65">{finding.observation}</p>
          <p className="mt-4 text-sm leading-relaxed text-paper-50/85"><span className="text-gold-500">Что попробовать: </span>{finding.recommendation}</p>
          {finding.kind === 'quizzes' && (finding.metrics.first_attempts ?? 0) < 5 && <p className="mt-3 text-xs leading-relaxed text-paper-50/40">Меньше пяти первых попыток: данных для устойчивого вывода о сложности пока недостаточно.</p>}
          <details className="mt-4 border-t border-paper-50/10 pt-3 text-xs">
            <summary className="cursor-pointer text-paper-50/50">Показатели из базы</summary>
            <dl className="mt-3 space-y-2">
              {Object.entries(finding.metrics).map(([key, value]) => <div key={key} className="flex justify-between gap-4">
                <dt className="text-paper-50/40">{METRICS[key] ?? key}</dt>
                <dd className="shrink-0 font-mono text-paper-50/75">{value === null ? 'нет данных' : key === 'active_seconds' ? duration(value) : key.includes('average_score') ? `${value}%` : value}</dd>
              </div>)}
            </dl>
          </details>
        </article>)}
      </div>
      <section className="rounded-xl border border-gold-500/20 p-5">
        <h3 className="font-serif text-lg">План на следующую неделю</h3>
        <ol className="mt-4 space-y-4">
          {result.next_steps.map((step, i) => <li key={i} className="flex gap-3 text-sm">
            <span className="font-mono text-gold-500">{i + 1}.</span>
            <div><div className="text-xs text-paper-50/40">{step.title}</div><p className="mt-1 text-paper-50/80">{step.action}</p><p className="mt-2 text-xs text-paper-50/50">Проверка результата: {step.check}</p></div>
          </li>)}
        </ol>
      </section>
      <section className="rounded-xl border border-paper-50/10 p-5 text-xs leading-relaxed text-paper-50/45">
        <h3 className="text-sm text-paper-50/70">Что важно учесть</h3>
        <p className="mt-2">Это рекомендации ИИ, а не оценка учеников. Просмотр не доказывает интерес, а отсутствие просмотров не означает неприязнь: материал могли не заметить или ещё не задавать. Даты публикации и число показов не учитываются.</p>
        <ul className="mt-3 list-disc space-y-1 pl-4">{result.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul>
        <p className="mt-3">Охват: {Object.entries(result.coverage).map(([key, count]) => `${GROUPS[key] ?? key} — ${count.included} из ${count.total}`).join('; ')}.</p>
        {Object.values(result.coverage).some((c) => c.included < c.total) && <p className="mt-2 text-gold-500/80">Каталог большой: для подробного сравнения отобраны самые и наименее используемые объекты. Общие показатели учитывают всю активность за период.</p>}
      </section>
    </div>}
  </div>
}
