import { motion, useInView } from 'framer-motion'
import { Fragment, ReactNode, useRef, useState } from 'react'

type Props = {
  children: string
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span'
  className?: string
  delay?: number
  stagger?: number
  by?: 'word' | 'char' | 'line'
}

/**
 * Слово выезжает снизу из-под обрезки.
 *
 * Обрезка нужна только на время полёта. Дальше она снимается: у курсивного
 * Fraunces хвосты («у», «р», свош запятой) и наклон заглавных («К», «Q»)
 * выходят за строку и вправо за ширину слова, а `overflow-hidden` срезал их
 * ровной линией — и по вертикали, и по горизонтали. Пока слово летит,
 * запас дают padding'и; как только долетело — режем нечем.
 */
export function RevealText({
  children,
  as = 'span',
  className = '',
  delay = 0,
  stagger = 0.04,
  by = 'word',
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })

  const units =
    by === 'char'
      ? children.split('')
      : by === 'line'
      ? children.split('\n')
      : children.split(' ')

  const Comp = motion[as] as any

  // Вызывающий код передаёт `block`, чтобы строки заголовка шли одна под
  // другой. Раньше класс дописывался к жёсткому `inline-block`, а в CSS-выдаче
  // Tailwind `.inline-block` стоит ПОСЛЕ `.block` и побеждал независимо от
  // порядка в атрибуте — все строки схлопывались в одну, и слова из соседних
  // строк («тесты,» + «мгновенная») слипались. Своё значение подставляем
  // только если вызывающий не задал display сам.
  const hasDisplay = /(^|\s)(block|inline-block|inline|flex|inline-flex|grid|hidden)(\s|$)/.test(
    className,
  )

  return (
    <Comp
      ref={ref}
      className={`${hasDisplay ? '' : 'inline-block'} select-none ${className}`}
      aria-label={children}
    >
      <span className="sr-only">{children}</span>
      <span aria-hidden className="inline-block">
        {units.map((u, i) => (
          // Пробел — отдельным текстовым узлом МЕЖДУ слов, а не внутри слова.
          // Внутри он оказывался последним символом inline-block'а, и браузер
          // его схлопывал: «как с учителем» рендерилось как «каксучителем».
          <Fragment key={i}>
            {u === ' ' ? (
              ' '
            ) : (
              <Unit text={u} inView={inView} delay={delay + i * stagger} />
            )}
            {by === 'word' && i < units.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </Comp>
  )
}

function Unit({
  text,
  inView,
  delay,
}: {
  text: string
  inView: boolean
  delay: number
}) {
  const [landed, setLanded] = useState(false)

  return (
    <span
      className={
        'inline-block align-baseline ' +
        // Запас по вертикали: буквы вылезают за line-height, а маска режет по
        // padding-боксу. Отрицательный margin той же величины возвращает
        // высоту строки — у inline-block её задаёт margin-box. По горизонтали
        // запас не нужен: замер ink-метрик Fraunces дал свес вправо максимум
        // 0.027em, а -mx съедал пробел между словами.
        'pt-[0.22em] pb-[0.45em] -mt-[0.22em] -mb-[0.45em]'
      }
      // Маска — clip-path, а НЕ overflow: у inline-block с overflow != visible
      // базовая линия берётся по нижнему краю margin-бокса вместо базовой
      // линии текста. Слово смещалось на время полёта и прыгало в момент
      // приземления — при скролле весь заголовок дёргался. clip-path на
      // раскладку и базовую линию не влияет вообще.
      //
      // По горизонтали маску раскрываем (-0.5em): прятать нужно только то,
      // что ниже строки. На замедлении слово стоит на месте ещё доли секунды,
      // и обрезка по бокам успевала срезать свес курсива — хвост «R», свош «Q».
      style={landed ? undefined : { clipPath: 'inset(0 -0.5em)' }}
    >
      {landed ? (
        // Долетело — отдаём обычный span без transform. Пока transform висит,
        // у слова свой слой отрисовки с границами по прямоугольнику раскладки,
        // а курсив рисует чернила правее него (хвост «R», свош «Q»). При
        // частичной перерисовке во время скролла этот хвост затирался и
        // возвращался только на полном кадре.
        <span className="inline-block">{text}</span>
      ) : (
        <motion.span
          // 170%: уехать нужно и за нижний padding, иначе слово выглядывает
          initial={{ y: '170%' }}
          animate={inView ? { y: '0%' } : { y: '170%' }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay }}
          onAnimationComplete={() => inView && setLanded(true)}
          className="inline-block"
        >
          {text}
        </motion.span>
      )}
    </span>
  )
}

export function Reveal({
  children,
  delay = 0,
  y = 40,
  className = '',
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
