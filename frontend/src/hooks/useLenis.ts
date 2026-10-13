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

export function scrollToElement(el: Element | null): void {
  if (!el) return
  if (instance) {
    instance.scrollTo(el as HTMLElement, { offset: NAV_OFFSET, duration: 1.1 })
    return
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function scrollToId(id: string): void {
  scrollToElement(document.getElementById(id))
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
