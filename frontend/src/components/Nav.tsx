import { useMotionValueEvent, useScroll } from 'framer-motion'
import { useState } from 'react'
import { Magnetic } from './Magnetic'
import { useVoice } from '../lib/voice'
import { useStudent } from '../lib/student'
import { sectionHref } from '../lib/nav'

// Разделы на месте всегда: если проходить нечего, секция объясняет это сама.
// Пряталась бы ссылка — ученик решил бы, что раздела вовсе нет.
// Якоря прогоняем через sectionHref: с /library «#weekly» вёл бы в никуда.
const links = [
  { label: 'Разделы', href: '#sections' },
  { label: 'ИИ-теоретик', href: '#ai' },
  { label: 'Пропустил урок', href: '#missed' },
  { label: 'Задача недели', href: '#weekly' },
  { label: 'Тесты', href: '#quizzes' },
  { label: 'Проверь решение', href: '#solution-checks' },
  { label: 'Библиотека', href: '#library' },
  { label: 'Обратная связь', href: '#feedback' },
  { label: 'Классы', href: '#classes' },
]



export function Nav() {
  // Шапка «проявляется» переключением класса, а не стилем на каждый кадр.
  // Плавное изменение радиуса backdrop-filter прокруткой заставляло браузер
  // заново размывать фон под шапкой каждый кадр — на этом и спотыкалась
  // прокрутка. Теперь два состояния и обычный CSS-переход между ними.
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 80))

  const student = useStudent()

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 select-none border-b transition-[background-color,backdrop-filter,border-color] duration-500 ease-out-quint ${
        scrolled
          ? 'border-paper-50/10 bg-ink-950/70 backdrop-blur-[14px]'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-x-3 gap-y-4 px-6 py-5 md:gap-x-10 md:px-10">
        <a href={sectionHref('#top')} data-cursor data-cursor-label="В начало" className="group flex shrink-0 items-center gap-3">
          <span className="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-paper-50/20">
            <span className="font-display text-base italic text-paper-50">∫</span>
          </span>
          <span className="font-display text-sm tracking-wide text-paper-50">
            Mathematica<span className="text-gold-500">.</span>
          </span>
        </a>

        <nav aria-label="Разделы сайта" className="order-last hidden w-full flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-paper-50/10 pt-4 md:flex min-[1800px]:order-none min-[1800px]:w-auto min-[1800px]:flex-1 min-[1800px]:border-0 min-[1800px]:pt-0">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href.startsWith('#') ? sectionHref(l.href) : l.href}
              data-cursor
              className="group relative shrink-0 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50/70 transition-colors hover:text-paper-50"
            >
              <span>{l.label}</span>
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold-500 transition-all duration-500 ease-out-expo group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <VoiceToggle />
          {student.status === 'authed' ? (
            <Magnetic strength={0.4}>
            <a
              href="/me"
              data-cursor="lg"
              data-cursor-label="Профиль"
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-gold-500/50 bg-gold-500/10 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50 backdrop-blur transition-colors hover:border-gold-500"
            >
              <span className="relative z-10 truncate max-w-[160px]">{student.student.name}</span>
              <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-gold-500" />
            </a>
            </Magnetic>
          ) : (
            <Magnetic strength={0.4}>
            <a
              href="/me"
              data-cursor="lg"
              data-cursor-label="Войти"
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-paper-50/20 bg-paper-50/5 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-paper-50 backdrop-blur transition-colors hover:border-gold-500/60"
            >
              <span className="relative z-10">Войти по QR</span>
              <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-gold-500 transition-transform duration-500 group-hover:scale-150" />
              <span className="absolute inset-0 -translate-x-full bg-gold-500/10 transition-transform duration-700 ease-out-expo group-hover:translate-x-0" />
            </a>
            </Magnetic>
          )}
        </div>
      </div>
    </header>
  )
}

/**
 * Включение сквозного голосового режима.
 * Запрос доступа к микрофону Chrome показывает по клику — поэтому это кнопка,
 * а не автостарт при загрузке страницы.
 */
function VoiceToggle() {
  const voice = useVoice()
  if (!voice.supported) return null

  return (
    <button
      type="button"
      onClick={() => (voice.enabled ? voice.disable() : voice.enable())}
      data-cursor
      data-cursor-label={voice.enabled ? 'Выключить голос' : 'Включить голос'}
      title={
        voice.enabled
          ? 'Голос включён: скажи «ИИ, вопрос»'
          : 'Включить голос: потом можно спрашивать, не нажимая кнопок'
      }
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
        voice.enabled
          ? 'border-gold-500/60 bg-gold-500/10 text-gold-500'
          : 'border-paper-50/15 text-paper-50/60 hover:border-paper-50/40 hover:text-paper-50'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          voice.enabled ? 'bg-gold-500' : 'bg-paper-50/30'
        }`}
      />
      <span className="hidden sm:inline">голос</span>
    </button>
  )
}
