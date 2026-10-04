import { test, expect } from '@playwright/test';

test('official catalog, exam citations and coverage are visible without replacing demo data', async ({ page }) => {
  await page.goto('/scoli?data=official&q=Gheorghe%20Laz');
  const cards = page.locator('.school-card');
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first()).toContainText('Date oficiale');
  await expect(cards.first().locator('a.source').last()).toHaveAttribute('href', 'https://data.gov.ro/dataset/retea-scolara-2025-2026');
  await cards.first().locator('a.card-title').click();
  await expect(page.locator('a.source[href="https://data.gov.ro/dataset/rezultate_bacalaureat_2026"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Admitere și specializări', exact: true })).toBeVisible();
  expect(await page.locator('a.source[href*="static.admitere.edu.ro/2026/"]').count()).toBeGreaterThan(0);
  await page.goto('/metodologie');
  await expect(page.locator('main')).toContainText('6.953 instituții');
  await expect(page.locator('a[href="https://www.plusedu.ro/"]')).toBeVisible();
  await expect(page.locator('main')).toContainText('CC BY 4.0');
  await page.goto('/scoli?data=demo&q=iasi');
  await expect(page.locator('.school-card')).toHaveCount(1);
  await expect(page.locator('.school-card')).toContainText('Date demo');
  const response = await page.request.get('/api/catalog?data=official&q=Gheorghe%20Laz');
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.schools.length).toBeGreaterThan(0);
  expect(result.schools.every((school: { demo: boolean; source_url: string }) => !school.demo && school.source_url.includes('data.gov.ro'))).toBe(true);
});
