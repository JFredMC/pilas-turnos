import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra el build de Pages en modo de ejemplo (`pnpm build:pages` sin PILAS_API_URL),
 * servido en /pilas-turnos/. E2E_BASE_URL=https://jfredmc.github.io/pilas-turnos/ las corre en vivo.
 */
const enVivo = process.env['E2E_BASE_URL'];
const baseURL = enVivo ?? 'http://localhost:4322/pilas-turnos/';
const ci = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  webServer: enVivo
    ? undefined
    : {
        command: 'node scripts/serve-pages.mjs',
        url: baseURL,
        reuseExistingServer: !ci,
        timeout: 15_000,
      },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
