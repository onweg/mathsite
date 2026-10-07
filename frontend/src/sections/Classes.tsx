import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion'
import { useRef, useState } from 'react'
import { Reveal, RevealText } from '../components/RevealText'

const classes = [
  {
    k: '08',
    name: '8 класс',
    sub: 'Основная работа',
    topics: ['Квадратные уравнения', 'Теорема Виета', 'Степени', 'Площади'],
    status: 'ONLINE',
  },
  {
    k: '09',
    name: '9 класс',
    sub: 'Подготовка к ОГЭ',
    topics: ['Арифметика', 'Геометрия', 'Статистика', 'Реальные задачи'],
    status: 'ВЕРСТКА',
  },
  {
    k: '11',
    name: '11 класс',
    sub: 'Подготовка к ЕГЭ',
    topics: ['Производная', 'Стереометрия', 'Параметры', 'Задачи 18-19'],
    status: 'СКОРО',
  },
]

export function Classes() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['10%', '-10%'])

  return (
    <section id="classes" ref={ref} className="relative py-32 md:py-44">
      <div className="mx-auto max-w-[1700px] px-6 md:px-10">
        <header className="mb-20 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <h2 className="max-w-3xl font-display text-[clamp(2.4rem,5.5vw,6rem)] font-light leading-[0.95] tracking-tight">
            <RevealText as="span" className="block">Три</RevealText>
            <RevealText as="span" className="block italic text-sage-500" delay={0.1}>
              потока
            </RevealText>
          </h2>
          <Reveal delay={0.3}>
            <p className="max-w-sm text-balance font-serif text-lg italic leading-snug text-paper-100/80">
              Разделение по классам, по учебникам, по целям — но ИИ один и помнит каждого ученика.
            </p>
          </Reveal>
        </header>

        <div className="flex flex-col divide-y divide-paper-50/10">
          {classes.map((c, i) => (
            <ClassRow key={c.k} data={c} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ClassRow({ data, index }: { data: typeof classes[number]; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  // плавное догоняние курсора через spring — число не телепортируется, а едет за курсором
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 90, damping: 20, mass: 0.6 })
  const sy = useSpring(y, { stiffness: 90, damping: 20, mass: 0.6 })

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    x.set(e.clientX - r.left)
    y.set(e.clientY - r.top)
  }

  const handleEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = e.clientX - r.left
    const py = e.clientY - r.top
    // телепортируем и исходное значение, и spring-выход — иначе цифра поедет
    // с прошлой позиции через всю строку
    x.jump(px)
    y.jump(py)
    sx.jump(px)
    sy.jump(py)
    setHovered(true)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
      data-cursor="lg"
      data-cursor-label={data.name}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: index * 0.08 }}
      className="group relative grid cursor-none select-none grid-cols-12 items-center gap-6 overflow-hidden py-10 md:py-14"
    >
      <motion.div
        aria-hidden
        style={{ x: sx, y: sy, willChange: 'transform' }}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: hovered ? 0.5 : 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute left-0 top-0"
      >
        <span className="block -translate-x-1/2 -translate-y-1/2 font-display text-[18vw] italic leading-none text-gold-500/90">
          {data.k}
        </span>
      </motion.div>

      <span className="col-span-2 font-mono text-[11px] uppercase tracking-[0.3em] text-paper-50/50 md:col-span-1">
        {data.k}
      </span>

      <div className="col-span-10 flex items-baseline gap-4 md:col-span-4">
        <h3 className="font-display text-5xl font-light leading-none tracking-tight transition-transform duration-700 ease-out-expo group-hover:translate-x-2 md:text-7xl">
          {data.name}
        </h3>
      </div>

      <div className="col-span-12 md:col-span-5">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
          {data.sub}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-serif text-base italic text-paper-100/80">
          {data.topics.map((t, i) => (
            <span key={t} className="relative">
              {t}
              {i < data.topics.length - 1 && (
                <span className="ml-6 inline-block text-paper-50/30">·</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="col-span-12 flex items-center justify-end gap-4 md:col-span-2">
        <span className={`font-mono text-[10px] uppercase tracking-[0.3em] ${
          data.status === 'ONLINE' ? 'text-emerald-400' : 'text-paper-50/50'
        }`}>
          {data.status}
        </span>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-paper-50/15 transition-all duration-500 group-hover:border-gold-500 group-hover:bg-gold-500 group-hover:text-ink-950">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M1 7h12M9 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </motion.div>
  )
}
