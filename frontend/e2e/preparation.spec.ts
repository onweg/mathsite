import { test, expect, login, createQuiz, API } from './fixtures'

for (const [track, grade, exam] of [['oge', '9А', 'ОГЭ'], ['ege', '11Б', 'ЕГЭ']] as const) {
  test(`library ${exam} keeps resources without retired practice tests`, async ({ page, pupil, teacherApi }) => {
    await createQuiz(teacherApi)
    const resource = await (await teacherApi.post('/admin/library', { data: { collection: track, kind: 'link', title: 'Полезный ресурс', url: 'https://example.org/math' } })).json()
    expect((await teacherApi.post(`/admin/library/${resource.id}/publish`)).ok()).toBeTruthy()
    await login(page)
    await page.getByRole('button', { name: 'Разделы', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(`Подготовка к ${exam}`) }).click()
    await expect(page.getByRole('button', { name: `Управлять тестами ${exam}` })).toHaveCount(0)
    const student = await (await teacherApi.post('/admin/students', { data: { name: `Ученик ${exam}`, class_label: grade } })).json()
    await pupil.goto(`/s/${student.qr_token}`)
    await expect(pupil).toHaveURL(/\/me$/)
    await expect(pupil.getByRole('link', { name: /Тесты для подготовки/ })).toHaveCount(0)
    for (const browserPage of [page, pupil]) {
      await browserPage.goto(`/library/${track}`)
      await expect(browserPage.getByRole('link', { name: /Полезный ресурс/ })).toBeVisible()
      await expect(browserPage.getByText('Тесты для прохождения', { exact: true })).toHaveCount(0)
      await expect(browserPage.getByText('ТЕСТЫ ПО QR', { exact: true })).toHaveCount(0)
      await expect(browserPage.locator('#quizzes').getByRole('button', { name: /Проверка сложения/ })).toBeVisible()
      expect(await (await browserPage.request.get(`${API}/quizzes?track=${track}`)).json()).toEqual([])
    }
  })
}
