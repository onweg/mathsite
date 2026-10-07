import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Magnetic } from '../components/Magnetic'
import { Markdown } from '../components/Markdown'
import { Reveal, RevealText } from '../components/RevealText'
import { askRag, type RagChunk, type RagReply, type Topic } from '../lib/api'

type State =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'answered'; query: string; reply: RagReply }
  | { kind: 'error'; message: string }

const CHIPS: Record<Topic, { label: string; q: string }[]> = {
  algebra: [
    { label: 'Дискриминант', q: 'что такое дискриминант квадратного уравнения' },
    { label: 'Теорема Виета', q: 'объясни теорему Виета простыми словами' },
    { label: 'Квадратный корень', q: 'как работать с квадратным корнем' },
    { label: 'Рациональные дроби', q: 'сложение и вычитание рациональных дробей' },
    { label: 'Степени', q: 'степень с целым показателем — что это' },
  ],
  geometry: [
    { label: 'Параллелограмм', q: 'свойства параллелограмма' },
    { label: 'Площадь трапеции', q: 'как найти площадь трапеции' },
    { label: 'Признаки подобия', q: 'признаки подобия треугольников' },
    { label: 'Теорема Пифагора', q: 'теорема Пифагора — доказательство и пример' },
    { label: 'Касательная', q: 'что такое касательная к окружности' },
  ],
}

export function MissedClass() {
  const [topic, setTopic] = useState<Topic>('algebra')
  const [input, setInput] = useState('')
  const [state, setState] = useState<State>({ kind: 'empty' })
  const resultRef = useRef<HTMLDivElement>(null)

  const run = async (q: string) => {
    if (!q.trim()) return
    setState({ kind: 'loading' })
    try {
      const reply = await askRag(q, { topic })
      setState({ kind: 'answered', query: q, reply })
      // плавно уводим фокус к ответу
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Не получилось',
      })
    }
  }

  const reset = () => {
    setState({ kind: 'empty' })
    setInput('')
    window.scrollTo({ top: window.scrollY - 400, behavior: 'smooth' })
  }

  return (
    <section id="missed" className="relative overflow-hidden py-32 md:py-44">
      {/* фоновый большой глиф */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-10 top-20 font-display text-[22rem] italic leading-none text-paper-50/[0.04]"
      >
        ∵
      </motion.div>

      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <header className="mb-16 flex flex-col items-start gap-8">
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
            <span className="h-px w-10 bg-paper-50/40" />
            <span>04 · Пропустил урок?</span>
          </div>

          <h2 className="font-display text-[clamp(2.6rem,7vw,8rem)] font-light leading-[0.92] tracking-[-0.03em]">
            <RevealText as="span" className="block">Нейросеть</RevealText>
            <RevealText as="span" className="block italic text-gold-500" delay={0.1}>
              читает учебник
            </RevealText>
            <RevealText as="span" className="block" delay={0.2}>
              за тебя
            </RevealText>
          </h2>

          <Reveal delay={0.3}>
            <p className="max-w-xl text-balance font-serif text-xl italic leading-snug text-paper-100/80">
              Выбери тему или задай вопрос — покажу разбор{' '}
              <span className="not-italic font-sans text-sm uppercase tracking-wider text-paper-50/80">
                строго
              </span>{' '}
              по учебнику, со ссылками на страницы.
            </p>
          </Reveal>
        </header>

        {/* Форма — всегда видна */}
        <AskForm
          topic={topic}
          onTopicChange={setTopic}
          value={input}
          onChange={setInput}
          onSubmit={() => run(input)}
          disabled={state.kind === 'loading'}
        />

        {/* Чипы — только в пустом состоянии */}
        <AnimatePresence>
          {state.kind === 'empty' && (
            <motion.div
              key="chips"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10"
            >
              <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
                Попробуй, что проходят:
              </div>
              <div className="flex flex-wrap gap-2">
                {CHIPS[topic].map((c, i) => (
                  <motion.button
                    key={c.label}
                    data-cursor
                    data-cursor-label="Разобрать"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.05 * i }}
                    onClick={() => {
                      setInput(c.q)
                      run(c.q)
                    }}
                    className="group relative overflow-hidden rounded-full border border-paper-50/15 bg-ink-900/60 px-4 py-2 font-mono text-xs uppercase tracking-wider text-paper-100 transition-colors hover:border-gold-500/70 hover:text-paper-50"
                  >
                    <span className="relative z-10">{c.label}</span>
                    <span className="absolute inset-0 -translate-x-full bg-gold-500/15 transition-transform duration-500 ease-out-expo group-hover:translate-x-0" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        <AnimatePresence mode="wait">
          {state.kind === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-16"
            >
              <LoadingLog />
            </motion.div>
          )}

          {state.kind === 'answered' && (
            <motion.div
              key="answered"
              ref={resultRef}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="mt-20"
            >
              <AnswerBlock
                query={state.query}
                reply={state.reply}
                topic={topic}
                onReset={reset}
              />
            </motion.div>
          )}

          {state.kind === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-10 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-5 text-sm text-rose-100"
            >
              {state.message}. Запущен ли backend?
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function AskForm({
  topic,
  onTopicChange,
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  topic: Topic
  onTopicChange: (t: Topic) => void
  value: string
  onChange: (s: string) => void
  onSubmit: () => void
  disabled: boolean
}) {
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-paper-50/10 bg-ink-900/60 p-5 md:flex-row md:items-center md:gap-6 md:p-6">
      <TopicToggle value={topic} onChange={onTopicChange} />

      <div className="h-px w-full bg-paper-50/10 md:h-10 md:w-px" />

      <input
        data-cursor
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder="О чём рассказать? Например: как раскладывать на множители"
        className="flex-1 bg-transparent px-2 py-2 text-base text-paper-50 placeholder:text-paper-50/35 focus:outline-none"
      />

      <Magnetic strength={0.4}>
        <button
          data-cursor="lg"
          data-cursor-label="Разобрать"
          disabled={disabled || !value.trim()}
          onClick={onSubmit}
          className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-gold-500 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="relative z-10">Разобрать</span>
          <svg
            className="relative z-10 transition-transform duration-500 group-hover:translate-x-1"
            width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path d="M1 5h12M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="absolute inset-0 translate-y-full bg-paper-50 transition-transform duration-700 ease-out-expo group-hover:translate-y-0" />
        </button>
      </Magnetic>
    </div>
  )
}

function TopicToggle({
  value,
  onChange,
}: {
  value: Topic
  onChange: (t: Topic) => void
}) {
  const items: { k: Topic; label: string }[] = [
    { k: 'algebra', label: 'Алгебра' },
    { k: 'geometry', label: 'Геометрия' },
  ]
  return (
    <div className="relative flex shrink-0 items-center rounded-full border border-paper-50/10 bg-ink-800/60 p-0.5">
      {items.map((it) => (
        <button
          key={it.k}
          onClick={() => onChange(it.k)}
          data-cursor
          className={`relative rounded-full px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors ${
            value === it.k ? 'text-ink-950' : 'text-paper-50/70 hover:text-paper-50'
          }`}
        >
          {value === it.k && (
            <motion.span
              layoutId="missed-topic-pill"
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="absolute inset-0 rounded-full bg-gold-500"
            />
          )}
          <span className="relative">{it.label}</span>
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function LoadingLog() {
  const steps = [
    'Ищу в учебнике Макарычева…',
    'Нашёл релевантные фрагменты.',
    'Читаю страницы и формулирую разбор…',
  ]
  return (
    <div className="rounded-3xl border border-paper-50/10 bg-ink-900/60 p-8 md:p-12">
      <div className="mb-6 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
        Разбираю твой вопрос
      </div>
      <ul className="space-y-4 font-mono text-sm text-paper-50/90">
        {steps.map((s, i) => (
          <motion.li
            key={s}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.6, duration: 0.5 }}
            className="flex items-center gap-3"
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4 + i * 0.6, type: 'spring' }}
              className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${
                i < steps.length - 1 ? 'bg-emerald-400/80 text-ink-950' : 'bg-gold-500/90 text-ink-950'
              }`}
            >
              {i < steps.length - 1 ? '✓' : <PulseDot />}
            </motion.span>
            <span>{s}</span>
          </motion.li>
        ))}
      </ul>
      <motion.div
        className="mt-8 h-px origin-left bg-gold-500/80"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 6, ease: 'linear' }}
      />
    </div>
  )
}

function PulseDot() {
  return (
    <motion.span
      animate={{ scale: [0.6, 1, 0.6] }}
      transition={{ duration: 1.2, repeat: Infinity }}
      className="inline-block h-1.5 w-1.5 rounded-full bg-ink-950"
    />
  )
}

/* -------------------------------------------------------------------------- */

function AnswerBlock({
  query,
  reply,
  topic,
  onReset,
}: {
  query: string
  reply: RagReply
  topic: Topic
  onReset: () => void
}) {
  const notFound = reply.chunks.length === 0 || reply.blocked
  const sourceLabel = topic === 'algebra' ? 'учебник алгебры 8 класса, Макарычев' : 'учебник геометрии 7–9, Атанасян'

  return (
    <article>
      {/* Вопрос как редакторский заголовок */}
      <div className="mb-10 border-l-2 border-gold-500 pl-6">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
          Вопрос
        </div>
        <p className="font-display text-2xl font-light italic leading-snug text-paper-50 md:text-3xl">
          {query}
        </p>
      </div>

      {/* Ответ */}
      <div className="relative rounded-3xl border border-paper-50/10 bg-ink-900/70 p-7 md:p-12">
        <div className="mb-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
          </span>
          <span>Разбор · {sourceLabel}</span>
        </div>
        <div className="prose-answer max-w-[70ch] text-paper-50">
          <Markdown text={reply.text} />
        </div>
      </div>

      {/* Источники */}
      {!notFound && reply.chunks.length > 0 && (
        <div className="mt-16">
          <div className="mb-8 flex items-end justify-between gap-6">
            <h3 className="font-display text-3xl font-light leading-tight tracking-tight md:text-5xl">
              Фрагменты, по которым разбор
            </h3>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
              {reply.chunks.length} шт.
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reply.chunks.map((c, i) => (
              <SourceCard key={i} chunk={c} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* CTA — задать другой */}
      <div className="mt-20 flex flex-col items-start gap-6 border-t border-paper-50/10 pt-10 md:flex-row md:items-center md:justify-between">
        <div className="max-w-md text-pretty font-serif text-lg italic text-paper-100/80">
          Разобрался? Можно разобрать ещё одну тему — ответы не копятся, каждый вопрос отдельно.
        </div>
        <Magnetic strength={0.4}>
          <button
            onClick={onReset}
            data-cursor="lg"
            data-cursor-label="Ещё раз"
            className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-paper-50/20 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50 transition-colors hover:border-gold-500"
          >
            <span>Разобрать другую тему</span>
            <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
          </button>
        </Magnetic>
      </div>
    </article>
  )
}

/* -------------------------------------------------------------------------- */

function SourceCard({ chunk, index }: { chunk: RagChunk; index: number }) {
  const ref = useRef<HTMLDivElement>(null)

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--cursor-x', `${e.clientX - r.left}px`)
    el.style.setProperty('--cursor-y', `${e.clientY - r.top}px`)
  }

  const pct = Math.round(chunk.similarity * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: index * 0.06 }}
      className="group"
    >
      <div
        ref={ref}
        onMouseMove={handleMove}
        data-cursor
        className="glow-cursor relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-paper-50/10 bg-ink-900/70 p-6 transition-colors duration-500 group-hover:border-paper-50/20"
      >
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
              Фрагмент №{index + 1}
            </div>
            <div className="mt-1 font-display text-5xl font-light italic leading-none text-gold-500">
              {chunk.page ?? '—'}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
              страница
            </div>
          </div>
          <div className="rounded-full border border-paper-50/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-paper-50/80">
            {pct}% соответствие
          </div>
        </div>

        <p className="relative z-10 mt-6 text-[13px] leading-relaxed text-paper-100/80 line-clamp-6">
          {chunk.preview}
        </p>

        <div className="relative z-10 mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-paper-50/40">
          <span>{chunk.source}</span>
        </div>
      </div>
    </motion.div>
  )
}
