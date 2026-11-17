/** User-facing errors for JSON requests, including uploads. No automatic retries. */
export class ApiError extends Error {
  constructor(message: string, readonly code: string | null = null, readonly status = 0) {
    super(message)
    this.name = 'ApiError'
  }
}

export function humanError(status: number): string {
  if (status === 0) return 'Не удалось связаться с сервером. Проверьте подключение к интернету и попробуйте ещё раз.'
  if (status === 401) return 'Срок входа истёк. Войдите заново.'
  if (status === 403) return 'У вас нет доступа к этому действию.'
  if (status === 404) return 'Материал не найден. Возможно, его удалили или сняли с публикации.'
  if (status === 408 || status === 504) return 'Сервер не успел ответить. Попробуйте ещё раз чуть позже.'
  if (status === 409) return 'Не удалось выполнить действие. Обновите данные и попробуйте ещё раз.'
  if (status === 413) return 'Файл слишком большой. Уменьшите его размер и загрузите снова.'
  if (status === 400 || status === 422) return 'Проверьте заполненные поля и попробуйте ещё раз.'
  if (status === 429) return 'Слишком много запросов. Подождите минуту и попробуйте снова.'
  if (status === 502 || status === 503) return 'Сервис временно недоступен. Попробуйте через минуту.'
  if (status >= 500) return 'На сервере произошла ошибка. Попробуйте ещё раз чуть позже.'
  return 'Не удалось выполнить действие. Попробуйте ещё раз.'
}

function transportError(error: unknown): ApiError {
  const name = error instanceof Error ? error.name : ''
  if (name === 'TimeoutError') return new ApiError(humanError(408), 'timeout')
  if (name === 'AbortError') return new ApiError('Запрос прерван. Попробуйте ещё раз.', 'aborted')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new ApiError('Нет подключения к интернету. Восстановите соединение и попробуйте ещё раз.', 'offline')
  }
  return new ApiError(humanError(0), 'network')
}

// Keep useful business messages (e.g. an already submitted test), but never
// render validation objects, HTML, tracebacks or provider diagnostics.
function readableDetail(detail: unknown): detail is string {
  return typeof detail === 'string' && detail.length <= 500 && /[а-яё]/i.test(detail)
    && !/[<>]|traceback|exception|\b(?:HTTP|SQL|LLM)\b|failed to fetch|networkerror|\bat \w+\(/i.test(detail)
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch (error) {
    throw transportError(error)
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const code = typeof data?.code === 'string' ? data.code : null
    const detail = response.status >= 400 && response.status < 500 && readableDetail(data?.detail)
      ? data.detail : humanError(response.status)
    throw new ApiError(detail, code, response.status)
  }
  if (response.status === 204) return undefined as T
  try {
    return await response.json() as T
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError('Не удалось прочитать ответ сервера. Обновите страницу и попробуйте ещё раз.', 'invalid_response', response.status)
    }
    throw transportError(error)
  }
}
