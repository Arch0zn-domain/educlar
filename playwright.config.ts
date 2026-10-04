import { defineConfig, devices } from '@playwright/test';
const baseURL=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const port=new URL(baseURL).port||'3000';
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, expect: { timeout: 15000 }, workers: 1,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: process.platform === 'win32' ? 'msedge' : undefined } }],
  webServer: { command: `npm run start -- --port ${port}`, url:baseURL, reuseExistingServer: !process.env.CI&&!process.env.TEST_BASE_URL, timeout: 120000,
    env: { APP_MODE: 'local', DATA_DIR: process.env.TEST_DATA_DIR||'.data/browser-test', BETTER_AUTH_URL:baseURL } },
});
