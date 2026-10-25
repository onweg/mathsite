import Lenis from 'lenis'
import { useEffect } from 'react'

/**
 * Инстанс держим на модуле: Lenis крутит свой RAF и каждый кадр выставляет
 * позицию скролла, поэтому нативный `scrollIntoView({behavior:'smooth'})`
 * он просто перетирает — прокрутка «не срабатывает». Любой программный
 * скролл на сайте должен идти через `scrollToElement` ниже.
 */
let instance: Lenis | null = null

/** Высота фиксированной шапки — на столько не доезжаем до верха секции. */
const NAV_OFFSET = -96

type Align = 'top' | 'bottom'

/**
 * `align: 'bottom'` подводит элемент к нижней части экрана, а не к верхней.
 * Нужно для поля ввода в чате: секция высокая, и выравнивание по её верху
 * оставляет само поле далеко внизу за краем экрана.
 */
export function scrollToElement(
  el: Element | null,
  opts: { align?: Align; margin?: number } = {},
): void {
  if (!el) return
  const { align = 'top', margin = 120 } = opts

  if (instance) {
    const offset =
      align === 'bottom'
        ? -(window.innerHeight - el.getBoundingClientRect().height - margin)
        : NAV_OFFSET
    instance.scrollTo(el as HTMLElement, { offset, duration: 1.1 })
    return
  }
  el.scrollIntoView({ behavior: 'smooth', block: align === 'bottom' ? 'end' : 'start' })
}

export function scrollToId(id: string): void {
  scrollToElement(document.getElementById(id))
}

/**
 * Наверх после перехода на другую страницу.
 *
 * Через Lenis, а не `window.scrollTo`: он каждый кадр выставляет позицию сам
 * и обычную прокрутку просто перетирает. `immediate` — без анимации: при
 * смене страницы пролёт через весь документ выглядит мусором.
 */
export function scrollWindowTo(y: number): void {
  if (instance) {
    instance.scrollTo(y, { immediate: true, force: true })
    return
  }
  window.scrollTo(0, y)
}

export function scrollToTop(): void {
  scrollWindowTo(0)
}

/**
 * Прокрутка к якорю, которого может ещё не быть в DOM.
 *
 * При переходе «библиотека → /#weekly» главная монтируется в том же кадре,
 * и секции появляются не сразу. Поэтому несколько попыток в течение
 * полусекунды, а не одна.
 */
export function scrollToIdWhenReady(id: string, attempts = 12): void {
  const tick = (left: number) => {
    const el = document.getElementById(id)
    if (el) {
      scrollToElement(el)
      return
    }
    if (left > 0) requestAnimationFrame(() => tick(left - 1))
  }
  requestAnimationFrame(() => tick(attempts))
}

/**
 * Якорь прокрутки вокруг перестройки DOM.
 *
 * Запоминает, где элемент стоял на экране, и возвращает функцию, которая
 * после перерисовки возвращает его туда же, подвинув скролл на разницу.
 * Нужно там, где блок меняет высоту не по воле пользователя (форма
 * превращается в карточку) — иначе страница уезжает под ним.
 *
 * Поправку обязательно гнать через Lenis: он каждый кадр выставляет позицию
 * сам и перетёр бы `window.scrollBy`.
 */
export function anchorScroll(el: Element | null): () => void {
  if (!el) return () => {}
  const before = el.getBoundingClientRect().top
  return () => {
    const delta = el.getBoundingClientRect().top - before
    if (Math.abs(delta) < 1) return
    if (instance) {
      instance.scrollTo(instance.scroll + delta, { immediate: true, force: true })
    } else {
      window.scrollBy(0, delta)
    }
  }
}

export function useLenis() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.4,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5,
    })
    instance = lenis

    let rafId = 0
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
      if (instance === lenis) instance = null
    }
  }, [])
}
