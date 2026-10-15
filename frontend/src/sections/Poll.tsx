import { motion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { RevealText, Reveal } from '../components/RevealText'
import { PollAnswerDTO, PollDTO, publicPolls } from '../lib/api'
import { anchorScroll } from '../hooks/useLenis'
import { useStudent } from '../lib/student'

const NAME_KEY = 'mathsite.student.name'

/**
 * Обратная связь: «какую тему повторить», «какой формат урока нравится».
 *
 * Секция целиком исчезает, когда открытых опросов нет, — пустой блок на
 * главной не нужен. Вошедший по QR видит свой прошлый ответ и может
 * переголосовать, аноним — только отправить.
 */
export function Poll() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const yBig = useTransform(scrollYProgress, [0, 1], ['20%', '-20%'])

  const [polls, setPolls] = useState<PollDTO[] | null>(null)

  useEffect(() => {
    publicPolls
      .list()
      .then(setPolls)
      .catch(() => setPolls([]))
  }, [])

  if (polls !== null && polls.length === 0) return null

  return (
    <section
      id="feedback"
      ref={ref}
      className="relative scroll-mt-24 overflow-hidden py-32 md:py-44"
    >
      <motion.div
        aria-hidden
        style={{ y: yBig }}
        className="pointer-events-none absolute -right-10 top-10 select-none font-display text-[20rem] italic leading-none text-sage-500/[0.05] md:text-[30rem]"
      >
        ?
      </motion.div>

      <div className="relative mx-auto grid max-w-[1700px] grid-cols-1 gap-14 px-6 md:grid-cols-12 md:px-10">
        <div className="md:col-span-5">
          <div className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
            <span className="h-px w-10 bg-paper-50/40" />
            <span>Обратная связь</span>
          </div>
          <h2 className="font-display text-[clamp(2.3rem,5.2vw,5.6rem)] font-light leading-[1] tracking-tight">
            <RevealText as="span" className="block">Скажи,</RevealText>
            <RevealText as="span" className="block italic text-sage-500" delay={0.1}>
              как учить тебя
            </RevealText>
          </h2>
          <Reveal delay={0.25} className="mt-10">
            <p className="max-w-md text-pretty text-base leading-relaxed text-paper-100/80">
              Какую тему повторить, какой формат урока заходит, что было
              непонятно. Ответы видит только учитель — имя рядом с ответом не
              показывается классу.
            </p>
          </Reveal>
        </div>

        <div className="space-y-6 md:col-span-7">
          {polls === null ? (
            <div className="font-mono text-xs uppercase tracking-[0.25em] text-paper-50/40">
              загружаем…
            </div>
          ) : (
            polls.map((p) => <PollCard key={p.id} poll={p} />)
          )}
        </div>
      </div>
    </section>
  )
}

function PollCard({ poll }: { poll: PollDTO }) {
  const auth = useStudent()
  const authed = auth.status === 'authed'

  const [mine, setMine] = useState<PollAnswerDTO | null>(null)
  const [sent, setSent] = useState<PollAnswerDTO | null>(null)
  const [editing, setEditing] = useState(false)

  const [chosen, setChosen] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY)?.trim() || '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!authed) {
      setMine(null)
      return
    }
    publicPolls.mine(poll.id).then((a) => {
      setMine(a)
      if (a) {
        setChosen(a.option_ids)
        setComment(a.comment)
      }
    })
  }, [poll.id, authed])

  const answered = mine ?? sent
  const showForm = !answered || editing

  function toggle(optionId: string) {
    setError(null)
    setChosen((prev) =>
      poll.multiple
        ? prev.includes(optionId)
          ? prev.filter((x) => x !== optionId)
          : [...prev, optionId]
        : [optionId],
    )
  }

  const empty =
    poll.kind === 'text' ? !comment.trim() : chosen.length === 0 && !comment.trim()

  async function send() {
    setBusy(true)
    setError(null)
    const restore = anchorScroll(boxRef.current)
    try {
      const clean = name.trim()
      if (!authed && clean) localStorage.setItem(NAME_KEY, clean)
      const a = await publicPolls.answer(poll.id, {
        option_ids: poll.kind === 'text' ? [] : chosen,
        comment,
        student_name: clean,
      })
      if (authed) setMine(a)
      else setSent(a)
      setEditing(false)
      requestAnimationFrame(restore)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось отправить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={boxRef}
      className="rounded-3xl border border-paper-50/10 bg-ink-950/60 p-6 md:p-8"
    >
      <h3 className="font-serif text-xl text-paper-50 md:text-2xl">{poll.title}</h3>
      {poll.question_md && (
        <div className="mt-3 text-sm leading-relaxed text-paper-100/70">
          <Markdown text={poll.question_md} />
        </div>
      )}

      {!showForm ? (
        <Answered
          poll={poll}
          answer={answered!}
          anonymous={!authed}
          onEdit={() => setEditing(true)}
        />
      ) : (
        <div className="mt-6 space-y-5">
          {poll.kind === 'choice' && (
            <ul className="space-y-2">
              {poll.options.map((o) => {
                const on = chosen.includes(o.id)
                return (
                  <li key={o.id}>
                    <button
                      onClick={() => toggle(o.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                        on
                          ? 'border-sage-500/70 bg-sage-500/10 text-paper-50'
                          : 'border-paper-50/10 text-paper-100/75 hover:border-paper-50/30'
                      }`}
                    >
                      <span
                        className={`h-3.5 w-3.5 shrink-0 border ${
                          poll.multiple ? 'rounded-[4px]' : 'rounded-full'
                        } ${on ? 'border-sage-500 bg-sage-500' : 'border-paper-50/30'}`}
                      />
                      {o.text}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {poll.multiple && poll.kind === 'choice' && (
            <p className="text-[11px] text-paper-50/40">Можно выбрать несколько.</p>
          )}

          {poll.allow_comment && (
            <label className="block space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/50">
                {poll.kind === 'text' ? 'твой ответ' : 'свой вариант или комментарий'}
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={poll.kind === 'text' ? 4 : 2}
                placeholder={
                  poll.kind === 'text'
                    ? 'Напиши своими словами'
                    : 'Необязательно'
                }
                className="w-full resize-y rounded-xl border border-paper-50/10 bg-ink-900/60 px-4 py-3 text-sm leading-relaxed text-paper-50 outline-none transition focus:border-paper-50/40"
              />
            </label>
          )}

          {!authed && (
            <label className="block space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/50">
                как тебя зовут
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Необязательно"
                className="w-full rounded-xl border border-paper-50/10 bg-ink-900/60 px-4 py-2.5 text-sm text-paper-50 outline-none transition focus:border-paper-50/40"
              />
            </label>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={send}
              disabled={busy || empty}
              className="rounded-full bg-paper-50 px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-950 transition disabled:opacity-40"
            >
              {busy ? 'отправляем…' : answered ? 'сохранить' : 'ответить'}
            </button>
            {editing && (
              <button
                onClick={() => setEditing(false)}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/40 transition hover:text-paper-50"
              >
                отмена
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Answered({
  poll,
  answer,
  anonymous,
  onEdit,
}: {
  poll: PollDTO
  answer: PollAnswerDTO
  anonymous: boolean
  onEdit: () => void
}) {
  const picked = poll.options.filter((o) => answer.option_ids.includes(o.id))
  return (
    <div className="mt-6 space-y-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-sage-500">
        ответ записан
      </div>

      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {picked.map((o) => (
            <li
              key={o.id}
              className="rounded-full border border-sage-500/30 bg-sage-500/5 px-4 py-1.5 text-sm text-paper-100/85"
            >
              {o.text}
            </li>
          ))}
        </ul>
      )}

      {answer.comment && (
        <p className="text-sm leading-relaxed text-paper-100/75">{answer.comment}</p>
      )}

      {anonymous ? (
        <p className="text-[11px] leading-relaxed text-paper-50/40">
          Спасибо. Без входа по QR изменить ответ отсюда не получится.
        </p>
      ) : (
        <button
          onClick={onEdit}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-50/50 transition hover:text-sage-500"
        >
          изменить ответ
        </button>
      )}
    </div>
  )
}
