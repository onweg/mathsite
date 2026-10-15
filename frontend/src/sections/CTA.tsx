import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { RevealText } from '../components/RevealText'

export function CTA() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1.06])
  const y = useTransform(scrollYProgress, [0, 1], ['10%', '-10%'])

  return (
    <section id="enter" ref={ref} className="relative pt-16 pb-40 md:pt-20 md:pb-56">
      <motion.div
        aria-hidden
        style={{ scale, y }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="select-none font-display text-[clamp(10rem,30vw,30rem)] italic leading-none text-gold-500/10">
          ∞
        </div>
      </motion.div>

      <div className="relative mx-auto flex max-w-[1400px] flex-col items-center px-6 text-center md:px-10">
        <h2 className="font-display text-[clamp(3rem,9.4vw,9.4rem)] font-light leading-[0.96] tracking-[-0.04em]">
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
      </div>
    </section>
  )
}
