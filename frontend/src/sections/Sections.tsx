import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { Reveal, RevealText } from '../components/RevealText'

type Item = {
  num: string
  title: string
  tag: string
  desc: string
  accent?: 'gold' | 'sage'
}

const items: Item[] = [
  {
    num: '01',
    title: 'Пропустил урок?',
    tag: 'RAG · Учебник',
    desc: 'Выбирай тему — нейросеть пересказывает параграф учебника Макарычева простым языком, с примерами и ссылкой на страницу.',
    accent: 'gold',
  },
  {
    num: '02',
    title: 'ИИ-теоретик',
    tag: 'Чат · Голос',
    desc: 'Чат на каждой странице. Скажи «ии, вопрос» — слушаю. «ии, ответь» — отвечаю. Контекст темы не теряется.',
    accent: 'sage',
  },
  {
    num: '03',
    title: 'Задача недели',
    tag: 'Олимпиада',
    desc: 'Одна задача, одна неделя, одно красивое решение. Разбор публикуется в пятницу.',
    accent: 'gold',
  },
  {
    num: '04',
    title: 'Вклад в оценку',
    tag: 'Тесты · Задачи',
    desc: 'Домашка, которая считается. Задача → решение → проверка. Тест → ответ → мгновенный разбор ошибки.',
    accent: 'sage',
  },
  {
    num: '05',
    title: 'Математика вокруг',
    tag: 'Истории',
    desc: 'Почему мост стоит, музыка звучит, а Google находит нужное. Короткие истории, где за всем — одна формула.',
    accent: 'gold',
  },
  {
    num: '06',
    title: 'Наше творчество',
    tag: 'Галерея',
    desc: 'Работы учеников, фото с олимпиад, кусочки уроков. Доска почёта, которая живёт.',
    accent: 'sage',
  },
]

export function Sections() {
  return (
    <section id="sections" className="relative py-32 md:py-44">
      <div className="mx-auto max-w-[1700px] px-6 md:px-10">
        <header className="mb-20 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <div>
            <div className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/60">
              <span className="h-px w-10 bg-paper-50/40" />
              <span>Что внутри · 06 разделов</span>
            </div>
            <h2 className="max-w-4xl font-display text-[clamp(2.6rem,6.5vw,7rem)] font-light leading-[0.95] tracking-tight">
              <RevealText as="span" className="block">Один сайт —</RevealText>
              <RevealText as="span" className="block italic text-gold-500" delay={0.1}>
                шесть сценариев
              </RevealText>
            </h2>
          </div>
          <Reveal delay={0.3}>
            <p className="max-w-sm text-balance font-serif text-lg italic leading-snug text-paper-100/80">
              Каждый раздел — отдельная комната. Из любой можно позвать ИИ.
            </p>
          </Reveal>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <Card key={item.num} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Card({ item, index }: { item: Item; index: number }) {
  const ref = useRef<HTMLDivElement>(null)

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const rx = ((y / rect.height) - 0.5) * -8
    const ry = ((x / rect.width) - 0.5) * 10
    el.style.setProperty('--cursor-x', `${x}px`)
    el.style.setProperty('--cursor-y', `${y}px`)
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`
  }

  const handleLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.transform = 'perspective(900px) rotateX(0) rotateY(0)'
  }

  const accentText = item.accent === 'sage' ? 'text-sage-500' : 'text-gold-500'
  const accentBg = item.accent === 'sage' ? 'bg-sage-500' : 'bg-gold-500'

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: index * 0.07 }}
      className="group"
    >
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        data-cursor="lg"
        data-cursor-label="Открыть"
        className="glow-cursor relative aspect-[0.9] overflow-hidden rounded-2xl border border-paper-50/8 bg-ink-900/70 p-7 transition-[transform,border-color] duration-500 ease-out-expo will-change-transform group-hover:border-paper-50/20 md:p-9"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="relative z-10 flex h-full flex-col">
          <div className="flex items-start justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper-50/50">
              {item.tag}
            </span>
            <span
              className={`inline-block select-none pl-2 pr-1 font-display text-5xl italic leading-[1.1] ${accentText}`}
              style={{ willChange: 'transform', transform: 'translateZ(0)' }}
            >
              {item.num}
            </span>
          </div>

          <div className="mt-auto">
            <h3 className="font-display text-3xl font-light leading-tight tracking-tight text-paper-50 md:text-4xl">
              {item.title}
            </h3>
            <p className="mt-4 max-w-[36ch] text-pretty text-sm leading-relaxed text-paper-100/70">
              {item.desc}
            </p>

            <div className="mt-7 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50">
              <span className="relative overflow-hidden">
                <span className="block transition-transform duration-500 ease-out-expo group-hover:-translate-y-full">
                  Войти в раздел
                </span>
                <span className={`absolute inset-0 block translate-y-full transition-transform duration-500 ease-out-expo group-hover:translate-y-0 ${accentText}`}>
                  Открыть
                </span>
              </span>
              <span className={`h-1.5 w-1.5 rounded-full ${accentBg}`} />
            </div>
          </div>
        </div>

        {/* subtle grid */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage:
              'linear-gradient(to right, #f6f2ea 1px, transparent 1px), linear-gradient(to bottom, #f6f2ea 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>
    </motion.div>
  )
}
