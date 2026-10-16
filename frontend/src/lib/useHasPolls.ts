import { useEffect, useState } from 'react'
import { PollDTO, publicPolls } from './api'

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
let cached: Promise<PollDTO[]> | null = null

/**
 * Открытые опросы одним запросом на загрузку страницы. Секция и меню
 * спрашивают одно и то же — без общего кеша в логах было два `GET /polls`
 * подряд на каждый заход.
 */
export function loadOpenPolls(): Promise<PollDTO[]> {
  if (!cached) {
    cached = publicPolls.list().catch(() => [] as PollDTO[])
  }
  return cached
}

export function useHasPolls(): boolean {
  const [has, setHas] = useState(false)

  useEffect(() => {
    let alive = true
    loadOpenPolls().then((ps) => {
      if (alive) setHas(ps.length > 0)
    })
    return () => {
      alive = false
    }
  }, [])

  return has
}
