import { defineConfig } from '@playwright/test';

if (!process.env.MEETPOINT_E2E_URL || !process.env.MEETPOINT_E2E_DATABASE_URL || !process.env.MEETPOINT_E2E_OUTPUT_DIR) {
  throw new Error('Run pnpm test:e2e to create the isolated test services.');
}

export default defineConfig({
  testDir: './test/browser',
  outputDir: process.env.MEETPOINT_E2E_OUTPUT_DIR,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  globalTimeout: 600_000,
  expect: { timeout: 20_000 },
  reporter: './test/browser/safe-reporter.cjs',
  use: {
    baseURL: process.env.MEETPOINT_E2E_URL,
    browserName: 'chromium',
    timezoneId: 'Asia/Seoul',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 15_000,
  },
});
