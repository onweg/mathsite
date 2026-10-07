import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { Magnetic } from '../components/Magnetic'
import { RevealText } from '../components/RevealText'

export function Hero() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })

  const yBg = useTransform(scrollYProgress, [0, 1], ['0%', '35%'])
  const yTitle = useTransform(scrollYProgress, [0, 1], ['0%', '-18%'])
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.08])

  return (
    <section
      id="top"
      ref={ref}
      className="relative isolate min-h-[115vh] overflow-hidden pt-32"
    >
      {/* Parallax backdrop glyphs */}
      <motion.div
        style={{ y: yBg, scale }}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 select-none"
      >
        <div className="absolute left-[-6%] top-[18%] font-display text-[22rem] italic leading-none text-paper-50/[0.04]">
          ∫
        </div>
        <div className="absolute right-[-4%] top-[12%] font-serif text-[18rem] italic leading-none text-gold-500/10">
          π
        </div>
        <div className="absolute left-[40%] top-[55%] font-mono text-[9rem] text-azure-500/10">
          x²+y²
        </div>
        <div className="absolute inset-0 grain" />
      </motion.div>

      <motion.div
        style={{ y: yTitle, opacity }}
        className="relative mx-auto flex max-w-[1700px] flex-col px-6 md:px-10"
      >
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
          <span className="h-px w-10 bg-paper-50/40" />
          <span>Урок № 2026 — 10 — 07</span>
        </div>

        <h1 className="mt-10 font-display text-[clamp(3rem,11vw,13rem)] font-light leading-[0.9] tracking-[-0.035em]">
          <span className="block">
            <RevealText as="span" className="text-paper-50">Матема</RevealText>
            <RevealText as="span" className="italic text-gold-500" delay={0.15}>тика</RevealText>
            <RevealText as="span" className="text-paper-50/60" delay={0.3}>,</RevealText>
          </span>
          <RevealText as="span" className="mt-1 block text-paper-50" delay={0.45}>
            которую
          </RevealText>
          <RevealText as="span" className="mt-1 block italic text-paper-200" delay={0.65}>
            хочется думать
          </RevealText>
        </h1>

        <div className="mt-20 grid grid-cols-1 gap-10 md:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-5 md:col-start-1"
          >
            <p className="max-w-md text-balance font-serif text-xl leading-snug text-paper-100/90 md:text-2xl">
              Сайт учителя, который работает{' '}
              <span className="italic text-gold-500">вместе</span> с нейросетью:
              объясняет, спрашивает, слушает голосом и помнит, где ты остановился.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-center gap-5 md:col-span-5 md:col-start-8"
          >
            <Magnetic strength={0.5}>
              <a
                href="#ai"
                data-cursor="lg"
                data-cursor-label="Задать"
                className="group relative inline-flex items-center gap-4 overflow-hidden rounded-full bg-paper-50 px-7 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-950"
              >
                <span className="relative z-10">Спросить у ИИ</span>
                <svg
                  className="relative z-10 transition-transform duration-500 group-hover:translate-x-1"
                  width="14" height="10" viewBox="0 0 14 10" fill="none">
                  <path d="M1 5h12M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="absolute inset-0 translate-y-full bg-gold-500 transition-transform duration-700 ease-out-expo group-hover:translate-y-0" />
              </a>
            </Magnetic>

            <Magnetic strength={0.35}>
              <a
                href="#weekly"
                data-cursor
                data-cursor-label="Задача"
                className="group inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50"
              >
                <span className="relative">
                  Задача недели
                  <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-paper-50 transition-transform duration-700 ease-out-expo group-hover:scale-x-100" />
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
              </a>
            </Magnetic>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 1.6 }}
          className="mt-24 flex items-end justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50"
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
            </span>
            <span>ИИ готов к диалогу</span>
          </div>
          <div className="hidden md:block">Прокрути — покажу</div>
          <div className="tabular-nums">1 / 06</div>
        </motion.div>
      </motion.div>

      <ScrollHint />
    </section>
  )
}

function ScrollHint() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.9, duration: 1 }}
      className="pointer-events-none absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60"
    >
      <span>scroll</span>
      <span className="relative block h-10 w-px overflow-hidden bg-paper-50/15">
        <motion.span
          className="absolute inset-x-0 top-0 h-4 w-px bg-gold-500"
          animate={{ y: ['-100%', '280%'] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </span>
    </motion.div>
  )
}
