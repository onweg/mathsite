import { test, expect, login, pdfFixture } from './fixtures'

test.use({ actionTimeout: 10_000 })

test('material picker searches and sorts thirty sources and keeps the answer source', async ({ page, teacherApi }, testInfo) => {
  test.setTimeout(120_000)
  const pdf = pdfFixture()
  const ids: Record<string, string> = {}
  for (let i = 0; i < 30; i++) {
    const title = `Учебник ${String(i).padStart(2, '0')}`
    const response = await teacherApi.post('/admin/materials', { multipart: {
      title, file: { name: 'lesson.pdf', mimeType: 'application/pdf', buffer: pdf },
    } })
    expect(response.ok()).toBeTruthy()
    ids[title] = (await response.json()).material.source_key
  }
  await expect.poll(async () => (await (await teacherApi.get('/materials')).json()).length).toBe(30)
  await page.goto('/#missed')
  const section = page.locator('#missed')
  await section.getByRole('button', { name: 'Сменить материал' }).click()
  const panel = section.locator('#material-picker-list')
  await expect(panel.getByRole('radio')).toHaveCount(32)
  await panel.getByLabel('Источники', { exact: true }).selectOption('material')
  await expect(panel.getByRole('radio')).toHaveCount(30)
  await panel.getByLabel('Порядок материалов').selectOption('reverse')
  await expect(panel.getByRole('radio').first()).toHaveAccessibleName('Учебник 29')
  await panel.getByLabel('Поиск материала', { exact: true }).fill('09 учебник')
  await expect(panel.getByRole('radio')).toHaveCount(1)
  await panel.getByRole('radio', { name: 'Учебник 09', exact: true }).click()
  await expect(panel).toBeHidden()
  await section.getByPlaceholder('О чём рассказать? Например: как раскладывать на множители').fill('Решить уравнение')
  const request = page.waitForRequest(r => r.url().endsWith('/rag/ask') && r.method() === 'POST')
  await section.getByRole('button', { name: 'Разобрать', exact: true }).click()
  expect((await request).postDataJSON().source_key).toBe(ids['Учебник 09'])
  await expect(section.getByText('Разбор · Учебник 09', { exact: true })).toBeVisible()
  await section.getByRole('button', { name: 'Сменить материал' }).click()
  await panel.getByLabel('Поиск материала', { exact: true }).fill('Учебник 10')
  await panel.getByRole('radio', { name: 'Учебник 10', exact: true }).click()
  await expect(section.getByText('Разбор · Учебник 09', { exact: true })).toBeVisible()
  await section.getByRole('button', { name: 'Сменить материал' }).click()
  await panel.getByLabel('Поиск материала', { exact: true }).fill('Несуществующая книга')
  await expect(panel.getByText('Материалы не найдены. Измените поиск или фильтр.')).toBeVisible()
  await panel.getByLabel('Поиск материала', { exact: true }).fill('')
  await panel.getByLabel('Источники', { exact: true }).selectOption('topic')
  await expect(panel.getByRole('radio')).toHaveCount(2)
  await page.screenshot({ path: testInfo.outputPath('material-picker.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  await panel.getByLabel('Поиск материала', { exact: true }).press('Escape')
  await expect(panel).toBeHidden()
  await expect(section.getByRole('button', { name: 'Сменить материал' })).toBeFocused()
})

test('teacher sees zero context, filters problems and retries processing', async ({ page, teacherApi }, testInfo) => {
  for (const [title, buffer] of [['Испорченный PDF', Buffer.from('Not a PDF')], ['Алгебра', pdfFixture()]] as const) {
    const result = await teacherApi.post('/admin/materials', { multipart: {
      title, file: { name: 'lesson.pdf', mimeType: 'application/pdf', buffer },
    } })
    expect(result.ok()).toBeTruthy()
  }
  await expect.poll(async () => (await (await teacherApi.get('/admin/materials')).json())
    .filter((m: { status: string }) => m.status === 'pending' || m.status === 'indexing').length).toBe(0)
  await login(page)
  await page.getByRole('button', { name: 'Материалы', exact: true }).click()
  await expect(page.getByText(/Требуют внимания: 1/)).toBeVisible()
  await page.getByRole('button', { name: 'Показать проблемные' }).click()
  const list = page.getByRole('list', { name: 'Загруженные материалы' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list.getByText('Нет контекста', { exact: true })).toBeVisible()
  await expect(list.getByText('Контекст: 0 фрагментов для поиска')).toBeVisible()
  await expect(list.getByText('Алгебра', { exact: true })).toHaveCount(0)
  await list.getByRole('button', { name: 'Повторить обработку' }).click()
  await expect(list.getByText('Нет контекста', { exact: true })).toBeVisible()
  await page.getByLabel('Состояние материала').selectOption('ready')
  await expect(list.getByText('Алгебра', { exact: true })).toBeVisible()
  await list.getByRole('button', { name: 'Повторить обработку' }).click()
  await expect(list.getByText('готов', { exact: true })).toBeVisible()
  await page.getByLabel('Состояние материала').selectOption('empty')
  await page.getByLabel('Поиск загруженных материалов').fill('нет такого')
  await expect(page.getByText('По этим условиям материалы не найдены.')).toBeVisible()
  await page.getByLabel('Поиск загруженных материалов').fill('')
  await page.screenshot({ path: testInfo.outputPath('material-admin.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
})
