import { PollDTO, publicPolls } from './api'

let cached: Promise<PollDTO[]> | null = null

/**
 * Открытые опросы одним запросом на загрузку страницы.
 *
 * Мемоизация на модуле: в StrictMode эффект монтируется дважды, да и
 * спрашивающих со временем может стать больше одного — сеть дёргаем один раз.
 */
export function loadOpenPolls(): Promise<PollDTO[]> {
  if (!cached) {
    cached = publicPolls.list().catch(() => [] as PollDTO[])
  }
  return cached
}
