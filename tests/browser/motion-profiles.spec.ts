import { test, expect } from '@playwright/test';

test('contributed profiles expose provenance without fabricated ratings', async ({ page }) => {
  await page.goto('/profesori/elena-hulber');
  await expect(page.getByRole('heading', { name: 'Elena Hulber', exact: true })).toBeVisible();
  const facts = page.locator('#provenienta');
  await expect(facts).toContainText('aprilie 2014');
  await expect(facts).toContainText('Studiile nu au fost confirmate independent');
  await expect(facts.locator('a[href^="https://"]')).toHaveCount(2);
  await expect(page.locator('.review-scores')).toHaveCount(0);
  await page.goto('/profesori/ciprian-augustin');
  await expect(page.locator('#provenienta')).toContainText('Nu au fost asociate biografii');
  await expect(page.locator('.review')).toHaveCount(0);
  await expect(page.getByText('Profil nerevendicat', { exact: true })).toBeVisible();
});

test('reduced motion disables effects and public content remains visible without JavaScript', async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/profesori');
  await expect(page.locator('.teacher-card')).toHaveCount(8);
  expect(await page.locator('.teacher-card').first().evaluate(element => ({
    animation: getComputedStyle(element).animationName,
    transition: getComputedStyle(element).transitionDuration,
  }))).toEqual({ animation: 'none', transition: '0s' });
  await expect(page.locator('[data-educlar-reveal]')).toHaveCount(0);
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
  const fallback = await context.newPage();
  await fallback.goto('/profesori/elena-hulber');
  await expect(fallback.getByRole('heading', { name: 'Elena Hulber', exact: true })).toBeVisible();
  await expect(fallback.locator('#provenienta')).toBeVisible();
  await context.close();
});
