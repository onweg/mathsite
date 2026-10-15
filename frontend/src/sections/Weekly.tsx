import { motion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { WeeklySubmit } from '../components/WeeklySubmit'
import { RevealText, Reveal } from '../components/RevealText'
import { WeeklyTaskPublicDTO, publicWeekly } from '../lib/api'

export function Weekly() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const yBig = useTransform(scrollYProgress, [0, 1], ['25%', '-25%'])
  const rotate = useTransform(scrollYProgress, [0, 1], [-6, 6])

  const [task, setTask] = useState<WeeklyTaskPublicDTO | null | undefined>(undefined)

  useEffect(() => {
    publicWeekly
      .current()
      .then(setTask)
      .catch(() => setTask(null))
  }, [])

  return (
    <section id="weekly" ref={ref} className="relative scroll-mt-24 overflow-hidden border-y border-paper-50/5 bg-ink-900 py-32 md:py-44">
      <motion.div
        aria-hidden
        style={{ y: yBig, rotate }}
        className="pointer-events-none absolute -left-10 top-10 select-none font-display text-[26rem] italic leading-none text-paper-50/[0.03] md:text-[36rem]"
      >
        03
      </motion.div>

      <div className="relative mx-auto grid max-w-[1700px] grid-cols-1 gap-14 px-6 md:grid-cols-12 md:px-10">
        <div className="md:col-span-5">
          <div className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
            <span className="h-px w-10 bg-paper-50/40" />
            <span>Задача недели</span>
          </div>
          <h2 className="font-display text-[clamp(2.3rem,5.2vw,5.6rem)] font-light leading-[1] tracking-tight">
            <RevealText as="span" className="block">Одна задача,</RevealText>
            <RevealText as="span" className="block italic text-gold-500" delay={0.1}>
              одна неделя
            </RevealText>
          </h2>
          <Reveal delay={0.25} className="mt-10">
            <p className="max-w-md text-pretty text-base leading-relaxed text-paper-100/80">
              Задача олимпиадного уровня появляется в понедельник. Разбор —
              в пятницу. Правильные решения попадают на «Доску почёта».
            </p>
          </Reveal>
        </div>

        <div className="md:col-span-7">
          <Reveal>
            <article className="relative rounded-3xl border border-paper-50/10 bg-ink-950/60 p-8 md:p-12">
              {task === undefined ? (
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-paper-50/40">
                  загружаем…
                </div>
              ) : task === null ? (
                <EmptyState />
              ) : (
                <>
                  <div className="mb-8 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
                    <span>{task.title}</span>
                  </div>
                  <div className="text-balance font-serif text-xl leading-relaxed text-paper-50 md:text-[1.6rem]">
                    <Markdown text={task.body_md} />
                  </div>
                </>
              )}
            </article>
          </Reveal>

          {task && (
            <Reveal delay={0.15}>
              <WeeklySubmit taskId={task.id} />
            </Reveal>
          )}
        </div>
      </div>
    </section>
  )
}

function EmptyState() {
  return (
    <div className="py-6 space-y-3 text-paper-50/60">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em]">
        задача недели ещё не опубликована
      </div>
      <p className="text-sm">
        Как только учитель опубликует новую задачу — она появится здесь.
      </p>
    </div>
  )
}
