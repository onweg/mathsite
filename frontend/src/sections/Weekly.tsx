import { motion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { WeeklySubmit } from '../components/WeeklySubmit'
import { RevealText, Reveal } from '../components/RevealText'
import { WeeklyTaskPublicDTO, publicWeekly } from '../lib/api'

/**
 * Задачи недели. Их может быть сколько угодно: учитель вешает на сайт одну
 * или сразу несколько и снимает каждую отдельно. Порядок — тот, в котором
 * они добавлены, чтобы нумерация у решающих не менялась от новой задачи.
 */
export function Weekly() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const yBig = useTransform(scrollYProgress, [0, 1], ['25%', '-25%'])
  const rotate = useTransform(scrollYProgress, [0, 1], [-6, 6])

  const [tasks, setTasks] = useState<WeeklyTaskPublicDTO[] | null>(null)

  useEffect(() => {
    publicWeekly
      .published()
      .then(setTasks)
      .catch(() => setTasks([]))
  }, [])

  const many = (tasks?.length ?? 0) > 1

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
            <span>{many ? 'Задачи недели' : 'Задача недели'}</span>
          </div>
          <h2 className="font-display text-[clamp(2.3rem,5.2vw,5.6rem)] font-light leading-[1] tracking-tight">
            <RevealText as="span" className="block">
              {many ? 'Несколько задач,' : 'Одна задача,'}
            </RevealText>
            <RevealText as="span" className="block italic text-gold-500" delay={0.1}>
              одна неделя
            </RevealText>
          </h2>
          <Reveal delay={0.25} className="mt-10">
            <p className="max-w-md text-pretty text-base leading-relaxed text-paper-100/80">
              {many
                ? 'Задачи олимпиадного уровня появляются в понедельник. Разбор — в пятницу. Решать можно любую, а можно все: решение к каждой присылается отдельно.'
                : 'Задача олимпиадного уровня появляется в понедельник. Разбор — в пятницу. Пришли своё решение — текстом или фото тетради.'}
            </p>
          </Reveal>
        </div>

        <div className="space-y-14 md:col-span-7">
          {tasks === null ? (
            <article className="rounded-3xl border border-paper-50/10 bg-ink-950/60 p-8 md:p-12">
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-paper-50/40">
                загружаем…
              </div>
            </article>
          ) : tasks.length === 0 ? (
            <Reveal>
              <article className="rounded-3xl border border-paper-50/10 bg-ink-950/60 p-8 md:p-12">
                <EmptyState />
              </article>
            </Reveal>
          ) : (
            tasks.map((task, i) => (
              <TaskCard
                key={task.id}
                task={task}
                number={tasks.length > 1 ? i + 1 : null}
              />
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function TaskCard({
  task,
  number,
}: {
  task: WeeklyTaskPublicDTO
  /** Номер показываем, только когда задач несколько: «Задача 1» в одиночку выглядит странно. */
  number: number | null
}) {
  return (
    <div className="space-y-0">
      <Reveal>
        <article className="relative rounded-3xl border border-paper-50/10 bg-ink-950/60 p-8 md:p-12">
          <div className="mb-8 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
            {number !== null && (
              <span className="text-gold-500/80">{String(number).padStart(2, '0')}</span>
            )}
            <span>{task.title}</span>
          </div>
          <div className="text-balance font-serif text-xl leading-relaxed text-paper-50 md:text-[1.6rem]">
            <Markdown text={task.body_md} />
          </div>
        </article>
      </Reveal>

      <Reveal delay={0.15}>
        <WeeklySubmit taskId={task.id} />
      </Reveal>
    </div>
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
