import { useEffect, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { QuizDTO, QuizItemDTO, adminQuizzes } from '../../lib/api'

/** Те же буквы, что на сайте: ученик подписывает вариант по его месту в списке. */
const CHOICE_LABELS = ['а', 'б', 'в', 'г', 'д', 'е']

const DIFFICULTY_RU: Record<string, string> = {
  easy: 'простой',
  medium: 'средний',
  hard: 'сложный',
}

/**
 * Печать квиза на бумагу. Открывается в новой вкладке, как печать QR-кодов.
 *
 * На экране порядок вариантов у каждого ученика свой (его задаёт сервер при
 * выдаче), а на листе он один для всех — берём тот, что лежит в базе. Поэтому
 * ключ считается по позиции варианта, а не по его id: на бумаге «б» — это
 * второй сверху, и ничего другого.
 */
export function PrintQuizPage({ token }: { token: string }) {
  const [quiz, setQuiz] = useState<QuizDTO | null>(null)
  const [error, setError] = useState<string | null>(null)

  const params = new URLSearchParams(window.location.search)
  const quizId = params.get('quiz') ?? ''

  // Ключ по умолчанию выключен: лист печатают пачкой на класс, и ответы
  // в каждом экземпляре — худшее, что можно сделать с тестом.
  const [withKey, setWithKey] = useState(false)
  const [withGrid, setWithGrid] = useState(true)
  const [withName, setWithName] = useState(true)

  useEffect(() => {
    if (!quizId) {
      setError('не указан тест')
      return
    }
    adminQuizzes
      .get(token, quizId)
      .then(setQuiz)
      .catch((e) => setError(e instanceof Error ? e.message : 'ошибка загрузки'))
  }, [quizId])

  if (error) return <div className="p-10 text-red-500">{error}</div>
  if (!quiz) return <div className="p-10 text-paper-50/50">загрузка…</div>
  if (quiz.items.length === 0)
    return <div className="p-10">в тесте «{quiz.title}» нет вопросов</div>

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
        }
        /* KaTeX на белом листе: цвет наследуется, межстрочный интервал нужен плотнее экранного */
        .print-sheet .math-rich { line-height: 1.6; }
      `}</style>
      <div className="min-h-screen bg-white text-black">
        <header className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-black/10 px-6 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-black/60">
              {quiz.title} · {quiz.items.length} вопросов ·{' '}
              {DIFFICULTY_RU[quiz.difficulty] ?? quiz.difficulty}
            </div>
            <div className="mt-1 text-sm text-black/70">
              Проверь, как разошлось по страницам, и нажми «Печать».
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-black/80">
              <Toggle checked={withName} onChange={setWithName} label="строка для имени" />
              <Toggle checked={withGrid} onChange={setWithGrid} label="бланк ответов" />
              <Toggle
                checked={withKey}
                onChange={setWithKey}
                label="ключ для учителя — отдельной страницей"
              />
            </div>
            {withKey && (
              <p className="mt-2 text-xs text-red-700">
                Ключ печатается последней страницей. Если печатаешь пачку на
                класс, он попадёт в каждый экземпляр.
              </p>
            )}
          </div>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Печать
          </button>
        </header>

        <main className="print-sheet mx-auto max-w-[190mm] px-6 py-8">
          <h1 className="font-serif text-2xl">{quiz.title}</h1>
          <div className="mt-1 text-xs text-black/60">
            {quiz.topic} · {DIFFICULTY_RU[quiz.difficulty] ?? quiz.difficulty} ·{' '}
            {quiz.items.length} вопросов
          </div>

          {withName && (
            <div className="mt-5 flex gap-8 text-sm">
              <span className="flex-1 border-b border-black/40 pb-1">Имя</span>
              <span className="w-32 border-b border-black/40 pb-1">Класс</span>
              <span className="w-28 border-b border-black/40 pb-1">Дата</span>
            </div>
          )}

          {withGrid && <AnswerGrid count={quiz.items.length} />}

          <p className="mt-5 text-xs text-black/60">
            В каждом вопросе один верный ответ. Обведи его букву
            {withGrid ? ' и перенеси в бланк сверху.' : '.'}
          </p>

          <ol className="mt-6 space-y-6">
            {quiz.items.map((item, i) => (
              <PrintItem key={item.id ?? i} item={item} number={i + 1} />
            ))}
          </ol>

          {withKey && <AnswerKey quiz={quiz} />}
        </main>
      </div>
    </>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-black"
      />
      {label}
    </label>
  )
}

/** Клеточки под ответы сверху листа: учителю проверять по одной строке. */
function AnswerGrid({ count }: { count: number }) {
  return (
    <table
      className="mt-5 w-full table-fixed border-collapse text-center text-sm"
      style={{ pageBreakInside: 'avoid' }}
    >
      <tbody>
        <tr>
          {Array.from({ length: count }, (_, i) => (
            <td key={i} className="border border-black/40 py-1 text-[11px] text-black/60">
              {i + 1}
            </td>
          ))}
        </tr>
        <tr>
          {Array.from({ length: count }, (_, i) => (
            <td key={i} className="h-9 border border-black/40" />
          ))}
        </tr>
      </tbody>
    </table>
  )
}

function PrintItem({ item, number }: { item: QuizItemDTO; number: number }) {
  return (
    <li className="pl-1" style={{ pageBreakInside: 'avoid' }} value={number}>
      <div className="flex items-baseline gap-3">
        <span className="w-6 shrink-0 font-serif text-[15px] leading-[1.6]">{number}.</span>
        <div className="min-w-0 flex-1">
          <Markdown text={item.question_md} />
          <ul className="mt-2 space-y-1.5">
            {item.choices.map((c, idx) => (
              <li key={c.id} className="flex items-baseline gap-2">
                <span className="w-6 shrink-0 text-[15px] leading-[1.6]">
                  {CHOICE_LABELS[idx] ?? idx + 1})
                </span>
                <div className="min-w-0 flex-1">
                  <Markdown text={c.text} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  )
}

/**
 * Ключ: номер вопроса, буква по позиции верного варианта и пояснение.
 * Буква берётся по месту в списке, а не из `correct_answer`, — на листе
 * порядок именно такой, как напечатан выше.
 */
function AnswerKey({ quiz }: { quiz: QuizDTO }) {
  return (
    <section className="page-break mt-10 border-t border-black/20 pt-6">
      <h2 className="font-serif text-xl">Ключ · {quiz.title}</h2>
      <p className="mt-1 text-xs text-black/60">
        Для учителя. Ученикам этот лист не выдаём.
      </p>
      <ol className="mt-4 space-y-2 text-sm">
        {quiz.items.map((item, i) => {
          const idx = item.choices.findIndex((c) => c.id === item.correct_answer)
          const letter = idx >= 0 ? (CHOICE_LABELS[idx] ?? idx + 1) : '—'
          return (
            <li key={item.id ?? i} className="flex gap-3">
              <span className="w-10 shrink-0">
                {i + 1}. <b>{letter}</b>
              </span>
              <div className="min-w-0 flex-1">
                {idx >= 0 && (
                  <div className="text-black/80">
                    <Markdown text={item.choices[idx].text} />
                  </div>
                )}
                {item.explanation && (
                  <div className="mt-0.5 text-xs text-black/55">{item.explanation}</div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
