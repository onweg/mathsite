import { test, expect, login, pdfFixture } from './fixtures'
import { ApiError, requestJson } from '../src/lib/http'

test.use({ actionTimeout: 10_000 })

test('request errors keep business codes and hide technical details', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Вы уже отправили ответ.', code: 'already_submitted' }), { status: 409 })
    try {
      await requestJson('/test')
      throw new Error('Expected rejection')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect(e).toMatchObject({ message: 'Вы уже отправили ответ.', code: 'already_submitted', status: 409 })
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: [{ msg: 'Field required', loc: ['body', 'title'] }] }), { status: 422 })
    await expect(requestJson('/test')).rejects.toThrow('Проверьте заполненные поля')
    globalThis.fetch = async () => new Response('<h1>413 Request Entity Too Large</h1>', { status: 413 })
    await expect(requestJson('/test')).rejects.toThrow('Файл слишком большой')
    globalThis.fetch = async () => { throw new DOMException('The operation timed out', 'TimeoutError') }
    await expect(requestJson('/test')).rejects.toThrow('Сервер не успел ответить')
    globalThis.fetch = async () => { throw new DOMException('Aborted', 'AbortError') }
    await expect(requestJson('/test')).rejects.toThrow('Запрос прерван')
    globalThis.fetch = async () => {
      const response = new Response('{}')
      response.json = async () => { throw new TypeError('Failed to fetch') }
      return response
    }
    await expect(requestJson('/test')).rejects.toThrow('Не удалось связаться с сервером')
    globalThis.fetch = async () => new Response(null, { status: 204 })
    expect(await requestJson('/test')).toBeUndefined()
  } finally {
    globalThis.fetch = original
  }
})

test('RAG explains connection and server failures, retains question and allows manual retry', async ({ page }) => {
  let mode = 'network'
  let requests = 0
  await page.route('**/rag/ask', async route => {
    requests++
    if (mode === 'network' || mode === 'offline') return route.abort('connectionfailed')
    if (mode === 'timeout') return route.fulfill({ status: 504, contentType: 'text/html', body: '<h1>Gateway Timeout</h1>' })
    if (mode === 'broken') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Broken response</html>' })
    if (mode === 'server') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Ошибка: Traceback SQL secret-password' }) })
    return route.continue()
  })
  await page.goto('/#missed')
  const section = page.locator('#missed')
  const input = section.getByPlaceholder('О чём рассказать? Например: как раскладывать на множители')
  const button = section.getByRole('button', { name: 'Разобрать', exact: true })
  await input.fill('Квадратный корень')
  for (const [failure, message] of [
    ['network', 'Не удалось связаться с сервером. Проверьте подключение к интернету и попробуйте ещё раз.'],
    ['timeout', 'Сервер не успел ответить. Попробуйте ещё раз чуть позже.'],
    ['broken', 'Не удалось прочитать ответ сервера. Обновите страницу и попробуйте ещё раз.'],
    ['server', 'На сервере произошла ошибка. Попробуйте ещё раз чуть позже.'],
    ['offline', 'Нет подключения к интернету. Восстановите соединение и попробуйте ещё раз.'],
  ]) {
    mode = failure
    if (mode === 'offline') await page.context().setOffline(true)
    const before = requests
    await button.click()
    await expect(section.getByText(message, { exact: true })).toBeVisible()
    await expect(input).toHaveValue('Квадратный корень')
    await expect(button).toBeEnabled()
    expect(requests).toBe(before + 1)
    await expect(section).not.toContainText(/Failed to fetch|Traceback|secret-password|Gateway Timeout/)
  }
  await page.context().setOffline(false)
  mode = 'healthy'
  await button.click()
  await expect(section.getByText(/Разбор ·/)).toBeVisible()
})

test('material upload explains unavailable service without losing the selected file', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Материалы', exact: true }).click()
  await page.getByLabel('PDF файл').setInputFiles({ name: 'lesson.pdf', mimeType: 'application/pdf', buffer: pdfFixture() })
  await page.getByLabel('название', { exact: true }).fill('Мой учебник')
  await page.route('**/admin/materials', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'LLM недоступен: HTTP 400' }) })
    : route.continue())
  await page.getByRole('button', { name: 'загрузить и индексировать' }).click()
  await expect(page.getByText('Сервис временно недоступен. Попробуйте через минуту.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('название', { exact: true })).toHaveValue('Мой учебник')
  expect(await page.getByLabel('PDF файл').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(1)
  await expect(page.getByRole('button', { name: 'загрузить и индексировать' })).toBeEnabled()
  await expect(page.locator('body')).not.toContainText('LLM недоступен')
})
