import { test as base, expect, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend')
export const API = 'http://127.0.0.1:8001'
export const EMAIL = 'teacher@example.test'
export const PASSWORD = 'test-password-123'

export async function installExternalFixtures(context: BrowserContext) {
  // Block third-party traffic only. Application JS/CSS, HTTP APIs and DB are real.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    if (url.pathname.endsWith('.hdr')) {
      return route.fulfill({ contentType: 'application/octet-stream', body: Buffer.concat([
        Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 2\n'),
        Buffer.from(Array(4).fill([128, 128, 128, 129]).flat()),
      ]) })
    }
    return route.abort()
  })
}

export const test = base.extend<{ teacherApi: APIRequestContext; pupil: Page }>({
  context: async ({ context }, use) => {
    execFileSync(process.env.TEST_PYTHON || path.join(backend, '.venv/bin/python'), ['-m', 'tests.reset'], { cwd: backend, env: process.env })
    await installExternalFixtures(context)
    const errors: string[] = []
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
    await use(context)
    expect(errors, 'Uncaught application errors in teacher/browser context').toEqual([])
  },
  teacherApi: async ({ playwright, context }, use) => {
    void context // ensures DB reset has finished before login
    const api = await playwright.request.newContext({ baseURL: API })
    const response = await api.post('/auth/login', { data: { email: EMAIL, password: PASSWORD } })
    expect(response.ok()).toBeTruthy()
    const { access_token } = await response.json()
    await api.dispose()
    const admin = await playwright.request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${access_token}` } })
    await use(admin)
    await admin.dispose()
  },
  pupil: async ({ browser, teacherApi, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor }, use) => {
    const response = await teacherApi.post('/admin/students', { data: { name: 'Иван Браузерный', class_label: '8А' } })
    expect(response.ok()).toBeTruthy()
    const student = await response.json()
    const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, reducedMotion: 'reduce' })
    await installExternalFixtures(context)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`/s/${student.qr_token}`)
    await expect(page).toHaveURL(/\/me$/)
    await use(page)
    await context.close()
    expect(errors, 'Uncaught application errors in pupil context').toEqual([])
  },
})

export { expect }

export async function login(page: Page) {
  await page.goto('/admin')
  await page.getByLabel('Email', { exact: true }).fill(EMAIL)
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Пароль', { exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'Класс', exact: true })).toBeVisible()
}

export async function createQuiz(api: APIRequestContext) {
  const response = await api.post('/admin/quizzes', { data: {
    title: 'Проверка сложения', topic: 'Алгебра', items: [{ position: 1, kind: 'mcq', question_md: 'Сколько будет 2 + 2?', choices: [{ id: 'a', text: 'Четыре' }, { id: 'b', text: 'Пять' }], correct_answer: 'a' }],
  } })
  expect(response.ok()).toBeTruthy()
  const quiz = await response.json()
  expect((await api.post(`/admin/quizzes/${quiz.id}/publish`)).ok()).toBeTruthy()
  return quiz
}

export function pdfFixture() {
  return execFileSync(process.env.TEST_PYTHON || path.join(backend, '.venv/bin/python'), ['-c', 'from tests.support import sample_pdf; import sys; sys.stdout.buffer.write(sample_pdf())'], { cwd: backend, env: process.env })
}
