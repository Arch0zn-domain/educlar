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
  await expect(page.locator('main')).toContainText('6.932 instituții');
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

test('historical filters keep the requested year and exam through catalog and school details', async ({ page }) => {
  await page.goto('/scoli?data=official&q=Gheorghe%20Laz&year=2023&exam=BAC');
  const cards=page.locator('.school-card');
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first()).toContainText('Medie BAC · 2023');
  const response=await page.request.get('/api/catalog?data=official&q=Gheorghe%20Laz&year=2023&exam=BAC');
  expect(response.ok()).toBe(true);
  const result=await response.json();
  expect(result.schools.every((s:{stat_year:number;stat_exam:string;demo:boolean})=>s.stat_year===2023&&s.stat_exam==='BAC'&&!s.demo)).toBe(true);
  await cards.first().locator('a.card-title').click();
  await expect(page).toHaveURL(/year=2023/);
  await expect(page.getByRole('heading',{name:'BAC · 2023 · vară',exact:true})).toBeVisible();
  await expect(page.locator('select[name="year"]')).toContainText('2026');
  await page.goto('/scoli?data=official&year=2025&exam=ADMITERE');
  await expect(page.locator('.school-card').first()).toContainText('Locuri ocupate');
  await expect(page.locator('.school-card').first()).toContainText('Ultime medii pe specializări · 2025');
  const admissions=await (await page.request.get('/api/catalog?data=official&year=2025&exam=ADMITERE')).json();
  expect(admissions.schools.every((s:{stat_year:number;stat_exam:string;specialization_count:number})=>s.stat_year===2025&&s.stat_exam==='ADMITERE'&&s.specialization_count>0)).toBe(true);
});

test('coverage explains the complete snapshot and unavailable admission history', async ({page})=>{
  await page.goto('/date');
  await expect(page.locator('main')).toContainText('36.418');
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(page.locator('main')).toContainText('HTTP 404');
  await expect(page.locator('main')).toContainText('mai multe locuri ocupate');
  const invalid=await page.request.get('/api/catalog?year=oops&exam=wrong&data=official');
  expect(invalid.ok()).toBe(true);
  const excluded=await (await page.request.get('/api/catalog?data=official&q=club%20sportiv')).json();
  expect(excluded.count).toBe(0);
});
