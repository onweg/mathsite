import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { Magnetic } from '../components/Magnetic'
import { RevealText } from '../components/RevealText'

export function CTA() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1.06])
  const y = useTransform(scrollYProgress, [0, 1], ['10%', '-10%'])

  return (
    <section id="enter" ref={ref} className="relative py-40 md:py-56">
      <motion.div
        aria-hidden
        style={{ scale, y }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="font-display text-[clamp(10rem,30vw,30rem)] italic leading-none text-gold-500/10">
          ∞
        </div>
      </motion.div>

      <div className="relative mx-auto flex max-w-[1400px] flex-col items-center px-6 text-center md:px-10">
        <div className="mb-10 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
          <span className="h-px w-10 bg-paper-50/40" />
          <span>Начать · 19.11.2026 — первый урок с классом</span>
          <span className="h-px w-10 bg-paper-50/40" />
        </div>

        <h2 className="font-display text-[clamp(3rem,10vw,10rem)] font-light leading-[0.9] tracking-[-0.04em]">
          <RevealText as="span" className="block">Войди по</RevealText>
          <RevealText as="span" className="block italic text-gold-500" delay={0.1}>
            своему QR
          </RevealText>
        </h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 max-w-xl text-balance font-serif text-xl italic leading-snug text-paper-100/80"
        >
          Один раз показать камере — и у тебя своя страница с прогрессом,
          историей ответов и персональной «Задачей недели».
        </motion.p>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-6">
          <Magnetic strength={0.5}>
            <a
              href="#"
              data-cursor="lg"
              data-cursor-label="Старт"
              className="group relative inline-flex items-center gap-4 overflow-hidden rounded-full bg-gold-500 px-9 py-5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-950"
            >
              <span className="relative z-10">Открыть демо-вход</span>
              <svg
                className="relative z-10 transition-transform duration-500 group-hover:translate-x-1"
                width="14" height="10" viewBox="0 0 14 10" fill="none">
                <path d="M1 5h12M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="absolute inset-0 translate-y-full bg-paper-50 transition-transform duration-700 ease-out-expo group-hover:translate-y-0" />
            </a>
          </Magnetic>
          <Magnetic strength={0.3}>
            <a
              href="#"
              data-cursor
              data-cursor-label="Админ"
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50/80 transition-colors hover:text-paper-50"
            >
              Я учитель — войти в админку →
            </a>
          </Magnetic>
        </div>
      </div>
    </section>
  )
}
