import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, expect: { timeout: 15000 }, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: process.platform === 'win32' ? 'msedge' : undefined } }],
  webServer: { command: 'npm run start', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 120000,
    env: { APP_MODE: 'local', DATA_DIR: '.data/browser-test', BETTER_AUTH_URL: 'http://127.0.0.1:3000' } },
});
