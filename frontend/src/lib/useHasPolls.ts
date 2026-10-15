import { useEffect, useState } from 'react'
import { publicPolls } from './api'

/**
 * Есть ли хоть один открытый опрос.
 *
 * Секция «Обратная связь» не рендерится, пока учитель ничего не опубликовал,
 * поэтому ссылка в меню прячется по тому же условию — иначе клик никуда
 * не ведёт. Логика та же, что у [useHasQuizzes].
 *
 * Запрос мемоизируется на модуле: спрашивающих может быть несколько,
 * сеть дёргаем один раз за загрузку страницы.
 */
let cached: Promise<boolean> | null = null

function load(): Promise<boolean> {
  if (!cached) {
    cached = publicPolls
      .list()
      .then((ps) => ps.length > 0)
      .catch(() => false)
  }
  return cached
}

export function useHasPolls(): boolean {
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
