import { test, expect, type Page } from '@playwright/test';
import { isolateLoginClient } from './login-client';

async function login(page: Page, phone: string) {
  await isolateLoginClient(page);
  await page.goto('/autentificare');
  await page.waitForFunction(() => localStorage.getItem('educlar-cookies') !== null || document.querySelector('.cookie-banner') !== null);
  const cookies = page.getByRole('button', { name: 'Doar necesare', exact: true });
  if (await cookies.isVisible()) await cookies.click();
  await page.getByLabel('Număr de telefon', { exact: true }).fill(phone);
  await page.getByRole('button', { name: 'Trimite codul', exact: true }).click();
  await page.locator('.code-button').click();
  await page.getByRole('button', { name: 'Intră în cont', exact: true }).click();
  await expect(page.locator('.account-center')).toBeVisible();
}

const roles = [
  { phone: '+40700000001', slug: 'administrator', title: 'Centrul de administrare', section: 'moderare', available: 'Verificări manuale', absent: 'Copiii și autorizările' },
  { phone: '+40700000002', slug: 'parinte', title: 'Spațiul părintelui', section: 'familie', available: 'Copiii și autorizările', absent: 'Ofertele mele' },
  { phone: '+40700000003', slug: 'elev', title: 'Spațiul elevului', section: 'recenzii', available: 'Tutorele meu', absent: 'Registrul surselor' },
  { phone: '+40700000004', slug: 'profesor', title: 'Spațiul profesorului', section: 'oferte', available: 'Profilul meu profesional', absent: 'Tutorele meu' },
  { phone: '+40700000005', slug: 'elev', title: 'Spațiul elevului', section: 'familie', available: 'Tutorele meu', absent: 'Povestea mea' },
  { phone: '+40700000006', slug: 'absolvent', title: 'Spațiul absolventului', section: 'absolvent', available: 'Povestea mea', absent: 'Copiii și autorizările' },
  { phone: '+40700000007', slug: 'moderator', title: 'Centrul de moderare', section: 'raportari', available: 'Recenzii și răspunsuri', absent: 'Verificări manuale' },
];

for (const role of roles) {
  test(`${role.slug} ${role.phone}: dedicated dashboard and focused sections`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page, role.phone);
    await expect(page).toHaveURL(`/cont/${role.slug}`);
    await expect(page.getByRole('heading', { name: role.title, exact: true })).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Secțiunile contului' });
    await expect(menu).toContainText(role.available);
    await expect(menu).not.toContainText(role.absent);
    await expect(page.locator('.account-main form')).toHaveCount(0);
    const links = await menu.locator('a').evaluateAll(elements => elements.map(element => element.getAttribute('href')!));
    for (const href of links) {
      const response = await page.goto(href);
      expect(response?.status(), href).toBe(200);
      await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(page.locator('.account-center')).toBeVisible();
    }
    await page.goto(`/cont/${role.slug}?sectiune=${role.section}`);
    await expect(page.locator('.account-main > section.panel')).toHaveCount(1);
    const returnPaths = await page.locator('.account-main input[name="returnTo"]').evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value));
    expect(returnPaths.every(path => path === `/cont/${role.slug}?sectiune=${role.section}`)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('account routes enforce roles and preserve verification links', async ({ page }) => {
  await page.goto('/cont/administrator');
  await expect(page).toHaveURL('/autentificare');
  await login(page, '+40700000003');
  for (const slug of ['profesor', 'administrator', 'moderator', 'parinte', 'absolvent']) {
    await page.goto(`/cont/${slug}`);
    await expect(page).toHaveURL('/cont/elev');
  }
  await page.goto('/cont/elev?sectiune=importuri');
  await expect(page).toHaveURL('/cont/elev');
  await expect(page.locator('.account-main form')).toHaveCount(0);
  await page.goto('/cont?teacher=ana-pop&sectiune=verificari');
  await expect(page).toHaveURL('/cont/elev?teacher=ana-pop&sectiune=verificari');
  await expect(page.locator('select[name="teacher_id"]')).toHaveValue('ana-pop');
  await expect(page.locator('input[name="returnTo"]')).toHaveValue('/cont/elev?teacher=ana-pop&sectiune=verificari');
});

test('moderators stay in their own workspace and can open their personal account', async ({ page }) => {
  await login(page, '+40700000007');
  await page.goto('/admin?sectiune=verificari');
  await expect(page).toHaveURL('/cont/moderator');
  await page.goto('/cont/administrator?sectiune=importuri');
  await expect(page).toHaveURL('/cont/moderator');
  await page.getByRole('link', { name: 'Deschide contul personal' }).click();
  await expect(page).toHaveURL('/cont/parinte');
  await page.getByRole('link', { name: 'Deschide moderarea' }).click();
  await expect(page).toHaveURL('/cont/moderator');
});

test('teacher and staff dashboards fit phones and both themes', async ({ page }) => {
  await login(page, '+40700000004');
  const base = '/cont/profesor';
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Tema interfeței').selectOption(theme);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base);
    await page.getByLabel('Tema interfeței').selectOption(theme);
    await page.screenshot({ path: `test-results/account-teacher-desktop-${theme}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const section of ['', '?sectiune=profil', '?sectiune=oferte', '?sectiune=verificari', '?sectiune=setari']) {
      await page.goto(base + section);
      await page.getByLabel('Tema interfeței').selectOption(theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${section} ${theme}`).toBe(true);
    }
    await page.goto(base);
    await page.getByLabel('Tema interfeței').selectOption(theme);
    await page.screenshot({ path: `test-results/account-teacher-mobile-${theme}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Ieși din cont' }).click();
  await expect(page).toHaveURL('/');
  await login(page, '+40700000001');
  await page.getByLabel('Tema interfeței').selectOption('light');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/account-admin-desktop-light.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Tema interfeței').selectOption(theme);
    for (const section of ['', '?sectiune=moderare', '?sectiune=verificari', '?sectiune=surse', '?sectiune=importuri']) {
      await page.goto('/cont/administrator' + section);
      await page.getByLabel('Tema interfeței').selectOption(theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${section} ${theme}`).toBe(true);
    }
    await page.goto('/cont/administrator');
    await page.getByLabel('Tema interfeței').selectOption(theme);
    await page.screenshot({ path: `test-results/account-admin-mobile-${theme}.png`, fullPage: true });
  }
});
