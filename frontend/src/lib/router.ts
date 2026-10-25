import { useCallback, useEffect, useState } from 'react'
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
  return p === '/' || isLibraryPath(p)
}

/**
 * Адрес библиотеки.
 *
 * Отдельной страницы у библиотеки больше нет — она секция главной. Но свои
 * адреса у полок остались: по ним ссылку на нужную полку можно дать ученику,
 * а кнопка «назад» возвращает из материала в полку, а не уводит с сайта.
 */
export function isLibraryPath(p: string): boolean {
  return p === '/library' || p.startsWith('/library/')
}

/** Якорь, к которому ведёт адрес без решётки. */
function anchorOf(p: string): string | null {
  return isLibraryPath(p) ? 'library' : null
}

/**
 * Что именно рендерит App. Главная и все адреса библиотеки — одна и та же
 * страница, поэтому переход между ними не должен перерисовывать её целиком:
 * меняется только то, что показывает секция библиотеки.
 */
function pageOf(p: string): string {
  if (p.startsWith('/admin')) return 'admin'
  if (p.startsWith('/s/')) return 'activate'
  if (p === '/me' || p.startsWith('/me/')) return 'me'
  return 'site'
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

  applyScroll(url.hash)
}

/**
 * Куда встать после перехода.
 *
 * Едем плавно, с разгоном и торможением: всё публичное — одна страница, так
 * что любому переходу есть откуда ехать, и по дороге видно, мимо чего
 * проезжаешь. Якоря ждём: секция может ещё не смонтироваться, если её
 * содержимое едет с сервера.
 */
function applyScroll(hash: string): void {
  const id = hash ? hash.slice(1) : anchorOf(window.location.pathname)
  if (!id) {
    scrollToTop()
    return
  }
  scrollToIdWhenReady(id)
}

/**
 * Подписка на смену адреса — и на наши переходы, и на кнопку «назад».
 * Сам обработчик ничего не прокручивает: этим занят один общий слушатель
 * в `useLinkRouting`, иначе каждая подписка восстанавливала бы скролл заново.
 */
function useRouteSync(sync: () => void): void {
  useEffect(() => {
    window.addEventListener(NAVIGATE_EVENT, sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener(NAVIGATE_EVENT, sync)
      window.removeEventListener('popstate', sync)
    }
  }, [sync])
}

/**
 * Какую страницу показывать. Отдельно от `useRoute`, чтобы переход
 * «главная → полка библиотеки» не перерисовывал всю главную: строка группы
 * не меняется, и React останавливает обновление на самом App.
 */
export function usePage(): string {
  const [page, setPage] = useState(() => pageOf(path()))
  useRouteSync(useCallback(() => setPage(pageOf(path())), []))
  return page
}

/** Текущий путь. Обновляется и на кнопку «назад» в браузере, и на наши переходы. */
export function useRoute(): string {
  const [current, setCurrent] = useState<string>(path)
  // Строка, а не объект: при том же пути React не станет перерисовывать.
  useRouteSync(useCallback(() => setCurrent(path()), []))
  return current
}

/**
 * Перехват кликов по ссылкам и восстановление прокрутки на «назад».
 * Ставится один раз на всё приложение.
 */
export function useLinkRouting(): void {
  useEffect(() => {
    // Кнопка «назад»: вернуть ровно туда, где человек был, а если такой
    // отметки нет (пришёл по чужой ссылке) — встать по адресу.
    const onPop = () => {
      remember()
      navigated = true
      const restore = scrollPositions.get(key())
      currentKey = key()
      if (restore !== undefined) scrollWindowTo(restore)
      else applyScroll(window.location.hash)
    }

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
    window.addEventListener('popstate', onPop)
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('popstate', onPop)
    }
  }, [])
}
