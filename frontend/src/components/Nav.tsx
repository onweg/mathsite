import { motion, useScroll, useTransform } from 'framer-motion'
import { Magnetic } from './Magnetic'

const links = [
  { label: 'Разделы', href: '#sections' },
  { label: 'ИИ-теоретик', href: '#ai' },
  { label: 'Пропустил урок', href: '#missed' },
  { label: 'Задача недели', href: '#weekly' },
  { label: 'Классы', href: '#classes' },
]

export function Nav() {
  const { scrollY } = useScroll()
  const bg = useTransform(scrollY, [0, 120], ['rgba(7,7,12,0)', 'rgba(7,7,12,0.72)'])
  const blur = useTransform(scrollY, [0, 120], ['blur(0px)', 'blur(14px)'])
  const border = useTransform(scrollY, [0, 120], ['rgba(246,242,234,0)', 'rgba(246,242,234,0.08)'])

  return (
    <motion.header
      style={{ background: bg, backdropFilter: blur, borderBottomColor: border }}
      className="fixed inset-x-0 top-0 z-50 select-none border-b"
    >
      <div className="mx-auto flex max-w-[1700px] items-center justify-between px-6 py-5 md:px-10">
        <a href="#top" data-cursor data-cursor-label="В начало" className="group flex items-center gap-3">
          <span className="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-paper-50/20">
            <span className="font-display text-base italic text-paper-50">∫</span>
          </span>
          <span className="font-display text-sm tracking-wide text-paper-50">
            Mathematica<span className="text-gold-500">.</span>
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              data-cursor
              className="group relative font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50/70 transition-colors hover:text-paper-50"
            >
              <span>{l.label}</span>
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold-500 transition-all duration-500 ease-out-expo group-hover:w-full" />
            </a>
          ))}
        </nav>

        <Magnetic strength={0.4}>
          <a
            href="#enter"
            data-cursor="lg"
            data-cursor-label="Войти"
            className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-paper-50/20 bg-paper-50/5 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50 backdrop-blur transition-colors hover:border-gold-500/60"
          >
            <span className="relative z-10">Войти по QR</span>
            <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-gold-500 transition-transform duration-500 group-hover:scale-150" />
            <span className="absolute inset-0 -translate-x-full bg-gold-500/10 transition-transform duration-700 ease-out-expo group-hover:translate-x-0" />
          </a>
        </Magnetic>
      </div>
    </motion.header>
  )
}
