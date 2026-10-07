import { motion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { RevealText } from '../components/RevealText'
import { chat, health, type ChatMessage, type Topic } from '../lib/api'

const initial: ChatMessage[] = [
  { role: 'assistant', text: 'Привет! Я ИИ-теоретик. Спроси что угодно по математике 8 класса — объясню просто.' },
]

export function AITeacher() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const yFloat = useTransform(scrollYProgress, [0, 1], ['12%', '-12%'])

  return (
    <section id="ai" ref={ref} className="relative overflow-hidden py-32 md:py-44">
      <div className="mx-auto grid max-w-[1700px] grid-cols-1 gap-14 px-6 md:grid-cols-12 md:px-10">
        <div className="md:col-span-5">
          <div className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
            <span className="h-px w-10 bg-paper-50/40" />
            <span>02 · ИИ-теоретик</span>
          </div>
          <h2 className="font-display text-[clamp(2.4rem,5.5vw,6rem)] font-light leading-[0.95] tracking-tight">
            <RevealText as="span" className="block">Голосом,</RevealText>
            <RevealText as="span" className="block italic text-azure-500" delay={0.1}>
              как с учителем
            </RevealText>
            <RevealText as="span" className="block" delay={0.2}>
              в пустом классе
            </RevealText>
          </h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10 max-w-md text-pretty text-base leading-relaxed text-paper-100/80"
          >
            Чат на каждой странице и голосовой режим. Якорь{' '}
            <span className="font-mono text-xs uppercase tracking-wider text-gold-500">
              «ии вопрос»
            </span>{' '}
            включает запись, якорь{' '}
            <span className="font-mono text-xs uppercase tracking-wider text-gold-500">
              «ии ответь»
            </span>{' '}
            отправляет. Ответ приходит текстом — чтобы можно было сохранить и переслушать.
          </motion.p>

          <ul className="mt-10 space-y-3 text-sm text-paper-100/70">
            {[
              'Контекст темы раздела подхватывается автоматически',
              'История разговора в карточке ученика',
              'Переключение модели: Claude · YandexGPT · GigaChat',
              'Пометка «проверено учителем» на сохранённых ответах',
            ].map((t, i) => (
              <motion.li
                key={t}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 + i * 0.08 }}
                className="flex items-start gap-3"
              >
                <span className="mt-2 h-px w-5 shrink-0 bg-gold-500" />
                <span>{t}</span>
              </motion.li>
            ))}
          </ul>
        </div>

        <div className="relative md:col-span-7">
          <div className="relative rounded-3xl border border-paper-50/10 bg-ink-900/80 p-5 shadow-[0_60px_120px_-40px_rgba(0,0,0,0.8)] backdrop-blur md:p-8">
            <ChatPanel />
          </div>

          <motion.div
            aria-hidden
            style={{ y: yFloat }}
            className="pointer-events-none absolute -right-10 -top-10 font-display text-[9rem] italic leading-none text-azure-500/20"
          >
            ∑
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(initial)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const [topic, setTopic] = useState<Topic>('algebra')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    health().then(setOnline)
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    const next: ChatMessage[] = [...messages, { role: 'user', text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setError(null)
    try {
      const reply = await chat(next.filter((m) => m.role !== 'system'), {
        topic,
        section: 'ИИ-теоретик, 8 класс',
      })
      setMessages([...next, { role: 'assistant', text: reply.text }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Что-то пошло не так')
      setMessages(next)
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/60">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <TopicToggle value={topic} onChange={setTopic} />
        <ServerStatus online={online} />
      </div>

      <div
        ref={listRef}
        data-lenis-prevent
        className="min-h-[320px] max-h-[60vh] space-y-4 overflow-y-auto pr-2 scrollbar-thin"
      >
        {messages.map((m, i) => (
          <Bubble key={i} who={m.role === 'user' ? 'student' : 'ai'} text={m.text} />
        ))}
        {loading && <Typing />}
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}. Запущен ли backend? ({'python -m uvicorn app.main:app --reload --port 8000'})
          </div>
        )}
      </div>

      <div className="mt-6 flex items-end gap-3 rounded-2xl border border-paper-50/10 bg-ink-800/80 p-3">
        <textarea
          data-cursor
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Спроси по математике · Enter — отправить"
          rows={1}
          className="min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-paper-50 placeholder:text-paper-50/40 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          data-cursor="lg"
          data-cursor-label="Отправить"
          className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-500 text-ink-950 transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:bg-paper-50/20 disabled:text-paper-50/40"
          aria-label="Отправить"
        >
          {loading ? <Spinner /> : <ArrowIcon />}
        </button>
      </div>
    </>
  )
}

function Bubble({ who, text }: { who: 'student' | 'ai'; text: string }) {
  const isAI = who === 'ai'
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}
    >
      <div
        className={`max-w-[82%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed ${
          isAI
            ? 'rounded-tl-sm border border-paper-50/10 bg-ink-800 text-paper-50'
            : 'rounded-tr-sm bg-gold-500/90 text-ink-950'
        }`}
      >
        <div className={`mb-1.5 font-mono text-[9px] uppercase tracking-[0.25em] ${isAI ? 'text-azure-400' : 'text-ink-950/60'}`}>
          {isAI ? 'ИИ · YandexGPT' : 'Ты'}
        </div>
        {isAI ? <Markdown text={text} /> : <div className="whitespace-pre-wrap">{text}</div>}
      </div>
    </motion.div>
  )
}

function Typing() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-tl-sm border border-paper-50/10 bg-ink-800 px-5 py-3.5">
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-azure-400">
          ИИ · YandexGPT
        </div>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-paper-50/80"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
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
    <div className="relative flex items-center rounded-full border border-paper-50/10 bg-ink-800/60 p-0.5">
      {items.map((it) => (
        <button
          key={it.k}
          onClick={() => onChange(it.k)}
          data-cursor
          className={`relative rounded-full px-3 py-1 font-mono text-[9px] uppercase tracking-[0.22em] transition-colors ${
            value === it.k ? 'text-ink-950' : 'text-paper-50/70 hover:text-paper-50'
          }`}
        >
          {value === it.k && (
            <motion.span
              layoutId="topic-pill"
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

function ServerStatus({ online }: { online: boolean | null }) {
  if (online === null) return <span className="opacity-50">· · ·</span>
  if (online)
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span>online</span>
      </div>
    )
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-rose-400" />
      <span>offline</span>
    </div>
  )
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 7h12M9 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
