/**
 * Якорь секции главной страницы.
 *
 * С самой главной это обычный «#weekly», а с отдельной страницы
 * (библиотека, профиль) такой href никуда не ведёт — нужен «/#weekly».
 */
export function sectionHref(hash: string): string {
  const onHome = typeof window === 'undefined' || window.location.pathname === '/'
  return onHome ? hash : `/${hash}`
}
