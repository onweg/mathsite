import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const python = process.env.TEST_PYTHON || path.resolve(here, '../backend/.venv/bin/python')
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a dedicated mathsite_test database (see TESTING.md).')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // scenarios reset the dedicated database; never run them concurrently
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/ui.xml' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure',
    reducedMotion: 'reduce',
    launchOptions: process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `"${python}" -m tests.prepare && "${python}" -m uvicorn tests.e2e_app:app --host 127.0.0.1 --port 8001`,
      cwd: path.resolve(here, '../backend'), url: 'http://127.0.0.1:8001/health',
      reuseExistingServer: false, timeout: 90_000,
    },
    {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 120_000,
      env: { VITE_API_URL: 'http://127.0.0.1:8001' },
    },
  ],
})
