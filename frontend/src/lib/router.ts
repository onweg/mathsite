import { useEffect, useState } from 'react'
import { scrollToIdWhenReady, scrollToTop, scrollWindowTo } from '../hooks/useLenis'

/**
 * Переходы без перезагрузки страницы — для публичной части сайта.
 *
 * Роутера в проекте нет, страницы выбираются по `location.pathname` в App.
 * Пока каждая ссылка была обычной, переход «библиотека → разделы» грузил
 * весь документ заново. Поэтому клики по внутренним ссылкам перехватываем и
 * меняем адрес через history API, а React перерисовывает нужную страницу.
 *
 * Перехватываем только публичную часть: админка и личный кабинет живут
 * своей жизнью (свой курсор, печать, отдельные экраны), и трогать их
 * поведение ради этой задачи незачем.
 *
 * Важно: в состоянии React лежит ТОЛЬКО путь, без якоря. Клик по «#тесты» —
 * это прокрутка внутри уже открытой страницы, и перерисовывать ради него всю
 * главную с трёхмерной сценой и десятком анимированных секций нельзя: именно
 * на этом она и подвисала.
 */

const NAVIGATE_EVENT = 'spa:navigate'

function path(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname
}

function key(): string {
  return window.location.pathname + window.location.hash
}

/** Публичные адреса: главная и библиотека. Остальное — обычной загрузкой. */
export function isPublicPath(p: string): boolean {
  return p === '/' || p === '/library' || p.startsWith('/library/')
}

/**
 * Где стояла прокрутка на каждом адресе.
 *
 * Нужно для кнопки «назад»: вернуться со статьи в длинный список и оказаться
 * в его начале — худшее, что может случиться с читающим. Браузер делает это
 * сам, но только при настоящей перезагрузке; наши переходы он не видит.
 */
const scrollPositions = new Map<string, number>()
//: адрес, на котором мы сейчас стоим; нужен, чтобы при уходе записать
//: позицию под СТАРЫМ ключом — в popstate адрес уже успел смениться
let currentKey = typeof window === 'undefined' ? '/' : key()
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

function remember(): void {
  scrollPositions.set(currentKey, window.scrollY)
}

export function navigate(href: string): void {
  const url = new URL(href, window.location.href)
  const samePage = url.pathname === window.location.pathname

  remember()
  navigated = true
  window.history.pushState(null, '', url.pathname + url.search + url.hash)
  currentKey = key()

  // Страница меняется — перерисовываем. Меняется только якорь — не трогаем
  // React вообще, иначе каждый пункт меню стоит полной перерисовки главной.
  if (!samePage) window.dispatchEvent(new Event(NAVIGATE_EVENT))

  applyScroll(url.hash, samePage)
}

/**
 * Куда встать после перехода.
 *
 * Внутри страницы едем плавно через весь сайт: с разгоном и торможением,
 * чтобы по дороге было видно, мимо чего проезжаешь. А вот переход с другой
 * страницы — мгновенный: ехать неоткуда, страница только что открылась, и
 * «поездка» по ней выглядит как сбой.
 */
function applyScroll(hash: string, samePage: boolean): void {
  if (!hash) {
    scrollToTop()
    return
  }
  const id = hash.slice(1)
  // Ждём появления якоря в обоих случаях: даже на своей странице секция может
  // ещё не смонтироваться, если её содержимое едет с сервера.
  scrollToIdWhenReady(id, { immediate: !samePage })
}

/** Текущий путь. Обновляется и на кнопку «назад» в браузере, и на наши переходы. */
export function useRoute(): string {
  const [current, setCurrent] = useState<string>(path)

  useEffect(() => {
    // Строка, а не объект: при том же пути React не станет перерисовывать.
    const sync = () => setCurrent(path())

    const onPop = () => {
      remember()
      navigated = true
      const restore = scrollPositions.get(key())
      currentKey = key()
      sync()
      if (restore !== undefined) scrollWindowTo(restore)
      else applyScroll(window.location.hash, false)
    }

    window.addEventListener('popstate', onPop)
    window.addEventListener(NAVIGATE_EVENT, sync)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener(NAVIGATE_EVENT, sync)
    }
  }, [])

  return current
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
