import { motion } from 'framer-motion'

const items = [
  'eⁱᵖ + 1 = 0',
  '∫ f(x) dx',
  'π · r²',
  'a² + b² = c²',
  'lim x→∞',
  'f : X → Y',
  '∂u/∂t = Δu',
  'sin²θ + cos²θ = 1',
  'ℝ ⊂ ℂ',
  '∇ × F',
]

export function Marquee() {
  const loop = [...items, ...items, ...items]
  return (
    <section className="relative select-none border-y border-paper-50/5 bg-ink-900 py-10 overflow-hidden" aria-hidden>
      <motion.div
        className="flex gap-16 whitespace-nowrap font-serif text-5xl italic text-paper-50/60 md:text-7xl"
        animate={{ x: ['0%', '-33.333%'] }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      >
        {loop.map((t, i) => (
          <span key={i} className="flex items-center gap-16">
            <span className="transition-colors duration-500 hover:text-gold-500">{t}</span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500/60" />
          </span>
        ))}
      </motion.div>
    </section>
  )
}
