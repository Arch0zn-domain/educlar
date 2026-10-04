import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.PLAYWRIGHT_PORT || 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PLAYWRIGHT_PORT invalid');
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, expect: { timeout: 15000 }, workers: 1,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: process.platform === 'win32' ? 'msedge' : undefined } }],
  webServer: { command: `npm run start -- --port ${port}`, url: baseURL, reuseExistingServer: false, timeout: 120000,
    env: { APP_MODE: 'local', DATA_DIR: port === 3000 ? '.data/browser-test' : `.data/browser-test-${port}`, BETTER_AUTH_URL: baseURL } },
});
