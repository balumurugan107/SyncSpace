import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173', viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {},
    screenshot: 'only-on-failure', trace: 'off' },
  // Traces are off because this suite creates authenticated sessions.
});
