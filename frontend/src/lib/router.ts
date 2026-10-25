import { useEffect, useState } from 'react'

/**
 * Переходы без перезагрузки страницы — для публичной части сайта.
 *
 * Роутера в проекте нет, страницы выбираются по `location.pathname` в App.
 * Пока каждая ссылка была обычной, переход «библиотека → разделы» грузил
 * весь документ заново: белая вспышка, повторный прелоадер, заново
 * скачанный бандл. Поэтому клики по внутренним ссылкам перехватываем и
 * меняем адрес через history API, а React просто перерисовывает нужную
 * страницу.
 *
 * Перехватываем только публичную часть: админка и личный кабинет живут
 * своей жизнью (свой курсор, печать, отдельные экраны), и трогать их
 * поведение ради этой задачи незачем.
 */

export type Route = { path: string; hash: string }

const NAVIGATE_EVENT = 'spa:navigate'

function read(): Route {
  if (typeof window === 'undefined') return { path: '/', hash: '' }
  return { path: window.location.pathname, hash: window.location.hash }
}

/** Публичные адреса: главная и библиотека. Остальное — обычной загрузкой. */
export function isPublicPath(path: string): boolean {
  return path === '/' || path === '/library' || path.startsWith('/library/')
}

/**
 * Где стояла прокрутка на каждом адресе.
 *
 * Нужно для кнопки «назад»: вернуться со статьи в длинный список и оказаться
 * в его начале — худшее, что может случиться с читающим. Браузер делает это
 * сам, но только при настоящей перезагрузке; наши переходы он не видит.
 */
const scrollPositions = new Map<string, number>()
let cameFromHistory = false
let navigated = false

/**
 * Был ли хоть один переход без перезагрузки.
 *
 * По этому признаку главная решает, показывать ли заставку: она про «сайт
 * загружается», и после клика по ссылке внутри сайта она выглядит как та
 * самая перезагрузка, от которой мы уходили.
 */
export function hasNavigated(): boolean {
  return navigated
}

function key(): string {
  return window.location.pathname + window.location.hash
}

export function navigate(href: string): void {
  scrollPositions.set(key(), window.scrollY)
  cameFromHistory = false
  navigated = true
  const url = new URL(href, window.location.href)
  window.history.pushState(null, '', url.pathname + url.search + url.hash)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/**
 * Сохранённая позиция, если сюда пришли кнопкой «назад» или «вперёд».
 * Значение одноразовое: следующий переход должен начинаться сверху.
 */
export function consumeSavedScroll(): number | null {
  if (!cameFromHistory) return null
  cameFromHistory = false
  return scrollPositions.get(key()) ?? null
}

/** Текущий адрес. Обновляется и на кнопку «назад» в браузере, и на наши переходы. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read)

  useEffect(() => {
    const sync = () => setRoute(read())
    const onPop = () => {
      // Позицию уходящей страницы тоже сохраняем: с неё могут вернуться «вперёд».
      scrollPositions.set(key(), window.scrollY)
      cameFromHistory = true
      navigated = true
      sync()
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener(NAVIGATE_EVENT, sync)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener(NAVIGATE_EVENT, sync)
    }
  }, [])

  return route
}

/** Перехват кликов по ссылкам. Ставится один раз на всё приложение. */
export function useLinkRouting(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Ctrl/Cmd/Shift и средняя кнопка — это «открыть в новой вкладке»,
      // такой клик всегда остаётся за браузером.
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const anchor = (e.target as Element | null)?.closest?.('a')
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return

      const url = new URL(href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Файлы и ручки API (/api/...) отдаём браузеру: это не наши экраны.
      if (!isPublicPath(url.pathname) || !isPublicPath(window.location.pathname)) return

      e.preventDefault()
      navigate(url.href)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
}
