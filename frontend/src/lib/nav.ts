/**
 * Якорь секции главной страницы.
 *
 * Адреса библиотеки — это та же главная, просто прокрученная к полке, так
 * что с них «#weekly» работает как обычно. А вот с профиля или админки такой
 * href никуда не ведёт — там нужен «/#weekly».
 */
export function sectionHref(hash: string): string {
  if (typeof window === 'undefined') return hash
  const p = window.location.pathname
  const onHome = p === '/' || p === '/library' || p.startsWith('/library/')
  return onHome ? hash : `/${hash}`
}
