import { useEffect, useState } from 'react'
import { publicQuizzes } from './api'

/**
 * Есть ли хоть один опубликованный квиз.
 *
 * Секция «Квизы» не рендерится, пока учитель ничего не опубликовал, поэтому
 * ссылка в меню и карточка раздела должны прятаться по тому же условию —
 * иначе клик никуда не ведёт.
 *
 * Запрос мемоизируется на модуле: Nav и Sections спрашивают одно и то же,
 * сеть дёргаем один раз за загрузку страницы.
 */
let cached: Promise<boolean> | null = null

function load(): Promise<boolean> {
  if (!cached) {
    cached = publicQuizzes
      .list()
      .then((qs) => qs.length > 0)
      .catch(() => false)
  }
  return cached
}

export function useHasQuizzes(): boolean {
  const [has, setHas] = useState(false)

  useEffect(() => {
    let alive = true
    load().then((v) => {
      if (alive) setHas(v)
    })
    return () => {
      alive = false
    }
  }, [])

  return has
}
