import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { RevealText, Reveal } from '../components/RevealText'
import {
  AttemptResultDTO,
  QuizPublicDTO,
  QuizSummaryDTO,
  publicQuizzes,
} from '../lib/api'
import { useStudent } from '../lib/student'

const NAME_KEY = 'mathsite.student.name'

type Screen =
  | { kind: 'list' }
  | { kind: 'intro'; quiz: QuizSummaryDTO }
  | { kind: 'run'; quiz: QuizPublicDTO }
  | { kind: 'result'; quiz: QuizPublicDTO; result: AttemptResultDTO }

export function Quizzes() {
  const [quizzes, setQuizzes] = useState<QuizSummaryDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>({ kind: 'list' })
  const auth = useStudent()
  const authedName =
    auth.status === 'authed' ? auth.student.name : null

  const sectionRef = useRef<HTMLElement>(null)
  const firstScreen = useRef(true)

  useEffect(() => {
    publicQuizzes
      .list()
      .then(setQuizzes)
      .catch((e) => setError(e instanceof Error ? e.message : 'не удалось загрузить квизы'))
  }, [])

  // Экраны квиза сильно разной высоты: список → прохождение → результат.
  // Без этого страница после смены экрана становится короче, скролл остаётся
  // на прежней позиции и пользователя «выбрасывает» в футер.
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false
      return
    }
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [screen.kind])

  if (!quizzes) {
    return null // пока грузится — ничего не показываем
  }
  if (quizzes.length === 0 && !error) {
    return null // учитель ещё ничего не опубликовал — секции нет
  }

  return (
    <section
      id="quizzes"
      ref={sectionRef}
      className="relative scroll-mt-24 border-y border-paper-50/5 bg-ink-950 py-32 md:py-44"
    >
      <div className="mx-auto max-w-[1700px] px-6 md:px-10">
        <header className="mb-14 md:mb-20">
          <div className="mb-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
            <span className="h-px w-10 bg-paper-50/40" />
            <span>Квизы · Проверь себя</span>
          </div>
          <h2 className="font-display text-[clamp(2.4rem,5.5vw,6rem)] font-light leading-[0.95] tracking-tight">
            <RevealText as="span" className="block">Короткие тесты,</RevealText>
            <RevealText as="span" className="block italic text-gold-500" delay={0.1}>
              мгновенная проверка
            </RevealText>
          </h2>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300/90">
            {error}
          </div>
        )}

        {screen.kind === 'list' && (
          <QuizList
            quizzes={quizzes}
            onOpen={async (q) => {
              // Авторизованный ученик — сразу в прохождение, intro не нужен.
              if (authedName) {
                try {
                  const full = await publicQuizzes.get(q.id)
                  setScreen({ kind: 'run', quiz: full })
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'не удалось загрузить квиз')
                }
              } else {
                setScreen({ kind: 'intro', quiz: q })
              }
            }}
          />
        )}

        {screen.kind === 'intro' && (
          <QuizIntro
            quiz={screen.quiz}
            onCancel={() => setScreen({ kind: 'list' })}
            onStart={(full) => setScreen({ kind: 'run', quiz: full })}
          />
        )}

        {screen.kind === 'run' && (
          <QuizRunner
            quiz={screen.quiz}
            onCancel={() => setScreen({ kind: 'list' })}
            onDone={(result) => setScreen({ kind: 'result', quiz: screen.quiz, result })}
          />
        )}

        {screen.kind === 'result' && (
          <QuizResult
            quiz={screen.quiz}
            result={screen.result}
            onBack={() => setScreen({ kind: 'list' })}
          />
        )}
      </div>
    </section>
  )
}

/* ---------- Экраны ---------- */

function QuizList({
  quizzes,
  onOpen,
}: {
  quizzes: QuizSummaryDTO[]
  onOpen: (q: QuizSummaryDTO) => void
}) {
  return (
    <Reveal>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {quizzes.map((q) => (
          <li key={q.id}>
            <button
              onClick={() => onOpen(q)}
              className="group block w-full rounded-2xl border border-paper-50/10 bg-ink-900/60 p-7 text-left transition hover:border-gold-500/50 hover:bg-ink-900/80"
            >
              <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
                <span>{labelSource(q.source_key)}</span>
                <span className="h-1 w-1 rounded-full bg-paper-50/40" />
                <span>{labelDiff(q.difficulty)}</span>
                <span className="h-1 w-1 rounded-full bg-paper-50/40" />
                <span>{q.items_count || '?'} вопросов</span>
              </div>
              <div className="font-serif text-2xl leading-tight text-paper-50 group-hover:text-gold-500 transition">
                {q.title}
              </div>
              <div className="mt-2 text-sm text-paper-100/60">{q.topic}</div>
            </button>
          </li>
        ))}
      </ul>
    </Reveal>
  )
}

function QuizIntro({
  quiz,
  onCancel,
  onStart,
}: {
  quiz: QuizSummaryDTO
  onCancel: () => void
  onStart: (full: QuizPublicDTO) => void
}) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) || ''
    } catch {
      return ''
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('напиши как тебя зовут — учитель увидит кто проходил')
      return
    }
    setBusy(true)
    setError(null)
    try {
      try {
        localStorage.setItem(NAME_KEY, trimmed)
      } catch {
        /* ignore */
      }
      const full = await publicQuizzes.get(quiz.id)
      onStart(full)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось загрузить квиз')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Reveal>
      <div className="mx-auto max-w-xl rounded-2xl border border-paper-50/10 bg-ink-900/60 p-8 space-y-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
            {quiz.topic} · {labelDiff(quiz.difficulty)} · {quiz.items_count} вопросов
          </div>
          <h3 className="mt-2 font-serif text-2xl text-paper-50">{quiz.title}</h3>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-paper-50/60">Твоё имя</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Иван Петров, 8А"
            className="w-full rounded-lg border border-paper-50/10 bg-ink-950/80 px-3 py-2.5 text-paper-50 outline-none focus:border-gold-500/60"
          />
        </label>

        {error && (
          <div className="text-sm text-red-400/90">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            onClick={start}
            disabled={busy}
            className="flex-1 rounded-full bg-paper-50 py-3 text-sm font-medium text-ink-950 disabled:opacity-50"
          >
            {busy ? 'загружаем…' : 'начать'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-full border border-paper-50/20 px-5 text-sm text-paper-50/70 hover:text-paper-50"
          >
            назад
          </button>
        </div>
      </div>
    </Reveal>
  )
}

function QuizRunner({
  quiz,
  onCancel,
  onDone,
}: {
  quiz: QuizPublicDTO
  onCancel: () => void
  onDone: (result: AttemptResultDTO) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = quiz.items.length
  const answered = Object.keys(answers).length

  async function submit() {
    if (answered < total) {
      setError(`осталось ответить на ${total - answered} вопрос(ов)`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const studentName = (localStorage.getItem(NAME_KEY) || 'аноним').trim()
      const result = await publicQuizzes.attempt(quiz.id, {
        student_name: studentName,
        answers,
      })
      onDone(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось отправить ответы')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
            {quiz.topic} · {quiz.items.length} вопросов
          </div>
          <h3 className="mt-1 font-serif text-xl text-paper-50">{quiz.title}</h3>
        </div>
        <button
          onClick={onCancel}
          className="text-xs text-paper-50/50 hover:text-paper-50 border border-paper-50/10 rounded px-2 py-1"
        >
          выйти
        </button>
      </header>

      <ol className="space-y-5">
        {quiz.items.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-paper-50/10 bg-ink-900/40 p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-paper-50/40 pt-1">
                № {item.position}
              </div>
              <div className="flex-1 text-paper-50">
                <Markdown text={item.question_md} />
              </div>
            </div>
            <div className="space-y-2">
              {item.choices.map((c) => {
                const selected = answers[item.id] === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => setAnswers((p) => ({ ...p, [item.id]: c.id }))}
                    className={`w-full text-left rounded-xl border px-4 py-3 flex items-start gap-3 transition ${
                      selected
                        ? 'border-gold-500/70 bg-gold-500/10'
                        : 'border-paper-50/10 bg-ink-950/40 hover:border-paper-50/30'
                    }`}
                  >
                    <span
                      className={`font-mono text-xs mt-0.5 ${
                        selected ? 'text-gold-500' : 'text-paper-50/40'
                      }`}
                    >
                      {c.id}
                    </span>
                    <div className="flex-1 text-paper-50/90">
                      <Markdown text={c.text} />
                    </div>
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ol>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300/90">
          {error}
        </div>
      )}

      <div className="sticky bottom-6 flex items-center justify-between gap-3 rounded-full border border-paper-50/15 bg-ink-900/90 px-5 py-3 backdrop-blur">
        <div className="text-xs text-paper-50/60">
          Отвечено: {answered} / {total}
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-full bg-paper-50 px-6 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
        >
          {busy ? 'проверяем…' : 'проверить'}
        </button>
      </div>
    </div>
  )
}

function QuizResult({
  quiz,
  result,
  onBack,
}: {
  quiz: QuizPublicDTO
  result: AttemptResultDTO
  onBack: () => void
}) {
  const pct = Math.round((result.score / Math.max(1, result.total)) * 100)
  const byItem = new Map(result.per_item.map((r) => [r.item_id, r]))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-paper-50/10 bg-ink-900/60 p-8 text-center space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
          {quiz.title}
        </div>
        <div className="font-display text-6xl text-paper-50">
          {result.score} <span className="text-paper-50/40">/ {result.total}</span>
        </div>
        <div className="font-mono text-xs uppercase tracking-widest text-gold-500">{pct}%</div>
      </div>

      <ol className="space-y-4">
        {quiz.items.map((item) => {
          const r = byItem.get(item.id)
          const correct = r?.correct ?? false
          const got = r?.got || '—'
          const expected = r?.expected || '?'
          return (
            <li
              key={item.id}
              className={`rounded-2xl border p-5 space-y-3 ${
                correct
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-red-500/30 bg-red-500/5'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="font-mono text-[11px] uppercase tracking-widest text-paper-50/40 pt-1">
                  № {item.position}
                </div>
                <div className="flex-1 text-paper-50">
                  <Markdown text={item.question_md} />
                </div>
                <div
                  className={`font-mono text-[10px] uppercase tracking-widest shrink-0 ${
                    correct ? 'text-emerald-300' : 'text-red-300'
                  }`}
                >
                  {correct ? 'верно' : 'ошибка'}
                </div>
              </div>
              {!correct && (
                <div className="text-sm text-paper-50/70">
                  Твой ответ: <code className="font-mono text-red-300">{got}</code> · правильный:{' '}
                  <code className="font-mono text-emerald-300">{expected}</code>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <div className="flex justify-center pt-2">
        <button
          onClick={onBack}
          className="rounded-full border border-paper-50/20 px-6 py-2.5 text-sm text-paper-50 hover:border-gold-500/60"
        >
          к списку квизов
        </button>
      </div>
    </div>
  )
}

/* ---------- helpers ---------- */

function labelDiff(d: string): string {
  if (d === 'easy') return 'просто'
  if (d === 'hard') return 'сложно'
  return 'средне'
}

function labelSource(s: string | null): string {
  if (s === 'textbook_8_algebra') return 'алгебра 8'
  if (s === 'textbook_8_geometry') return 'геометрия'
  if (s === 'olympiad') return 'олимпиада'
  return 'разное'
}
