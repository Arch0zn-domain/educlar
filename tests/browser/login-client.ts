import { test, type Page } from '@playwright/test';

let sequence = 0;

export async function isolateLoginClient(page: Page) {
  // Model separate browser clients so the role matrix does not share the
  // production OTP throttle. Keep the application's rate limits enabled.
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `198.18.${test.info().workerIndex % 256}.${++sequence}` });
}
