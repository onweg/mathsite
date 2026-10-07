import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { Magnetic } from '../components/Magnetic'
import { RevealText, Reveal } from '../components/RevealText'

export function Weekly() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const yBig = useTransform(scrollYProgress, [0, 1], ['25%', '-25%'])
  const rotate = useTransform(scrollYProgress, [0, 1], [-6, 6])

  return (
    <section id="weekly" ref={ref} className="relative overflow-hidden border-y border-paper-50/5 bg-ink-900 py-32 md:py-44">
      <motion.div
        aria-hidden
        style={{ y: yBig, rotate }}
        className="pointer-events-none absolute -left-10 top-10 font-display text-[26rem] italic leading-none text-paper-50/[0.03] md:text-[36rem]"
      >
        03
      </motion.div>

      <div className="relative mx-auto grid max-w-[1700px] grid-cols-1 gap-14 px-6 md:grid-cols-12 md:px-10">
        <div className="md:col-span-5">
          <div className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
            <span className="h-px w-10 bg-paper-50/40" />
            <span>Задача недели · 07 — 13 октября</span>
          </div>
          <h2 className="font-display text-[clamp(2.4rem,5.5vw,6rem)] font-light leading-[0.95] tracking-tight">
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
          <div className="mt-10 flex items-center gap-6">
            <Magnetic strength={0.4}>
              <a
                href="#"
                data-cursor="lg"
                data-cursor-label="Решить"
                className="group inline-flex items-center gap-3 overflow-hidden rounded-full border border-paper-50/20 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50 transition-colors hover:border-gold-500"
              >
                <span>Отправить решение</span>
                <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
              </a>
            </Magnetic>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
              До разбора · 4 д 12 ч
            </div>
          </div>
        </div>

        <div className="md:col-span-7">
          <Reveal>
            <article className="relative rounded-3xl border border-paper-50/10 bg-ink-950/60 p-8 md:p-12">
              <div className="mb-8 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/50">
                <span>Задача № 142</span>
                <span className="text-gold-500">★ ★ ★ ☆ ☆</span>
              </div>
              <p className="text-balance font-serif text-2xl leading-relaxed text-paper-50 md:text-[1.9rem]">
                В выпуклом четырёхугольнике{' '}
                <span className="italic text-gold-500">ABCD</span> диагонали
                пересекаются в точке{' '}
                <span className="italic text-gold-500">O</span>. Известно, что
                площади треугольников{' '}
                <span className="italic">AOB</span> и{' '}
                <span className="italic">COD</span> равны 9 и 16. Найдите площадь
                четырёхугольника, если{' '}
                <span className="italic">AO · OC = BO · OD</span>.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[10px] uppercase tracking-[0.25em] text-paper-50/55">
                <span>Темы:</span>
                <span className="text-paper-50">Планиметрия</span>
                <span className="h-1 w-1 rounded-full bg-paper-50/40" />
                <span className="text-paper-50">Подобие</span>
                <span className="h-1 w-1 rounded-full bg-paper-50/40" />
                <span className="text-paper-50">Отношения площадей</span>
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
