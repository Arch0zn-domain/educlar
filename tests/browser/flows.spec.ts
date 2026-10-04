import { test, expect } from '@playwright/test';
import { login,dismissCookies } from './auth';
const baseURL=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
test('public pages and all internal navigation targets load without browser errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const routes = new Set(['/', '/scoli', '/profesori', '/meditatii', '/absolventi', '/autentificare', '/metodologie', '/termeni', '/cookies', '/confidentialitate', '/solicitari', '/compara']);
  for (const path of [...routes]) {
    const response = await page.goto(path); expect(response?.status(), path).toBe(200); await dismissCookies(page);
    const links = await page.locator('a[href^="/"]').evaluateAll(elements => elements.map(a => a.getAttribute('href')!).filter(h => !h.startsWith('/api/') && !h.startsWith('/cont')));
    for (const link of links) routes.add(link);
  }
  for (const path of routes) { const response = await page.goto(path); expect(response?.status(), path).toBe(200); }
  expect(errors).toEqual([]);
});
test('cookies, theme persistence, rejection and system appearance work', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' }); await page.goto('/');
  await page.getByLabel('Tema interfeței').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('educlar-theme'))).toBeNull();
  await page.getByRole('button', { name: 'Acceptă preferințele', exact: true }).click();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Setări cookies', exact: true }).click();
  await page.getByRole('button', { name: 'Doar necesare', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('educlar-theme'))).toBeNull();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
test('search and comparison persist, enforce three schools and handle blocked storage', async ({ page }) => {
  await page.goto('/scoli?q=iasi'); await dismissCookies(page); await expect(page.locator('.school-card')).toHaveCount(1);
  await page.goto('/scoli'); const checkboxes = page.locator('.compare-toggle input');
  await page.getByLabel('Județ', { exact: true }).selectOption('Cluj');
  await expect(page.getByLabel('Localitate', { exact: true })).toContainText('Cluj-Napoca');
  await page.getByLabel('Localitate', { exact: true }).selectOption('Cluj-Napoca');
  await page.getByLabel('Județ', { exact: true }).selectOption('Iași');
  await expect(page.getByLabel('Localitate', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Localitate', { exact: true })).not.toContainText('Cluj-Napoca');
  await page.getByLabel('Județ', { exact: true }).selectOption('');
  for (let i = 0; i < 3; i++) await checkboxes.nth(i).check();
  await checkboxes.nth(3).click(); await expect(page.getByRole('status')).toContainText('cel mult trei');
  await page.reload(); await expect(page.locator('.compare-tray')).toContainText('3 din 3');
  await page.locator('.compare-tray').getByRole('link', { name: 'Compară', exact: true }).click();
  await expect(page.locator('.compare-table thead th')).toHaveCount(4);
  await page.goto('/scoli');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage blocked for test'); }; });
  await page.locator('.compare-toggle input:checked').first().uncheck();
  await expect(page.locator('.compare-tray')).toContainText('2 din 3');
});
test('public privacy form persists and is visible to the administrator', async ({ page, browser }) => {
  const message = `Solicitare publică de acces, test browser ${Date.now()}.`;
  await page.goto('/solicitari'); await dismissCookies(page);
  await page.getByLabel('Contact de test', { exact: true }).fill(`test-${Date.now()}@example.invalid`);
  await page.getByLabel('Descrie solicitarea', { exact: true }).fill(message);
  await page.getByRole('button', { name: 'Înregistrează solicitarea' }).click();
  await expect(page.getByRole('status')).toContainText('Cererea a fost înregistrată');
  const context = await browser.newContext({ baseURL }); const admin = await context.newPage(); await login(admin, '+40700000001'); await admin.goto('/admin/privacy');
  const request = admin.locator('.queue-item').filter({ hasText: message }); await expect(request).toHaveCount(1);
  await request.locator('select[name="subject_id"]').selectOption('demo-student');
  await request.getByLabel('Răspuns și motiv').fill('Solicitarea de acces de test și titularul au fost verificate.');
  await request.getByRole('checkbox').check(); await request.getByRole('button', { name: 'Generează exportul', exact: true }).click();
  await expect(admin.getByRole('status')).toContainText('salvate');await expect(request).toContainText('Finalizat');
  const href=await request.getByRole('link',{name:'Descarcă exportul privat pentru predare verificată'}).getAttribute('href');expect(href).toBeTruthy();
  const exported=await admin.request.get(href!);expect(exported.status()).toBe(200);expect(exported.headers()['cache-control']).toBe('no-store');expect((await exported.json()).user.id).toBe('demo-student');
  expect((await page.request.get(href!)).status()).toBe(401);
  await login(page,'+40700000003');await page.goto('/cont');await expect(page.locator(`#date a[href="${href}"]`)).toBeVisible();expect((await page.request.get(href!)).status()).toBe(200);
  await context.close();
});
test('OTP login, review moderation and tutoring acceptance complete in the UI', async ({ page, browser }) => {
  await login(page, '+40700000003'); await page.goto('/profesori/ana-pop');
  const message = `Experiență de browser ${Date.now()}: explicații clare și feedback util la exercițiile de test.`;
  const form = page.locator('form').filter({ has: page.locator('input[name="op"][value="review"]') });
  await form.locator('textarea[name="body"]').fill(message); await form.getByRole('button', { name: 'Trimite pentru moderare' }).click();
  await expect(page.getByRole('status')).toContainText('Recenzia a fost trimisă');
  const adminContext = await browser.newContext({ baseURL }), admin = await adminContext.newPage(); await login(admin, '+40700000001'); await admin.goto('/admin');
  const pending = admin.locator('#moderare article').filter({ hasText: message }); await expect(pending).toHaveCount(1);
  await pending.getByLabel('Motivul deciziei').fill('Experiență demonstrativă verificată, aprobată în test.'); await pending.getByRole('button', { name: 'Aprobă', exact: true }).click();
  await page.reload(); await expect(page.locator('.review').filter({ hasText: message })).toHaveCount(1);
  await page.goto('/meditatii'); await page.getByText('Trimite o cerere', { exact: true }).click();
  const requestMessage = `Pregătire de test la matematică ${Date.now()}, pentru admitere.`;
  await page.getByLabel('Ce ai vrea să înveți?').fill(requestMessage); await page.locator('input[name="not_current_teacher"]').check(); await page.getByRole('button', { name: 'Trimite cererea' }).click();
  await expect(page.getByRole('status')).toContainText('salvate');
  const teacherContext = await browser.newContext({ baseURL }), teacher = await teacherContext.newPage(); await login(teacher, '+40700000004');
  const request = teacher.locator('#cereri article').filter({ hasText: requestMessage }); await request.getByRole('button', { name: 'Acceptă', exact: true }).click();
  await page.goto('/cont'); const accepted = page.locator('#cereri article').filter({ hasText: requestMessage }); await expect(accepted).toContainText('Acceptat'); await expect(accepted).toContainText('+40700000004');
  await page.getByRole('button', { name: 'Ieși din cont' }).click(); await expect(page).toHaveURL('/');
  await adminContext.close(); await teacherContext.close();
});
test('new accounts record explicit terms acceptance', async ({ page }) => {
  await login(page, '+407' + String(Date.now()).slice(-8));
  await expect(page.getByRole('heading', { name: 'Completează profilul.' })).toBeVisible();
  await page.locator('input[name="accept_terms"]').check(); await page.getByRole('button', { name: 'Creează profilul' }).click();
  await expect(page.getByRole('heading', { name: 'Contul meu', exact: true })).toBeVisible();
  await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Acces restricționat.' })).toBeVisible();
});
test('verification uploads stay private and are deleted after the decision', async ({ page, browser }) => {
  await login(page, '+40700000003');
  const verification = page.locator('#verificari form'); await verification.locator('select[name="school_id"]').selectOption('orizont');
  await verification.locator('input[type="file"]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
  await verification.getByRole('button', { name: 'Trimite pentru verificare' }).click(); await expect(page.getByRole('status')).toContainText('salvate');
  const adminContext = await browser.newContext({ baseURL }), admin = await adminContext.newPage(); await login(admin, '+40700000001'); await admin.goto('/admin');
  const item = admin.locator('#verificari article').filter({ hasText: 'Apartenență școlară · Elev demo' }).last();
  const href = await item.getByRole('link', { name: 'Descarcă dovada privată' }).getAttribute('href'); expect(href).toBeTruthy();
  expect((await page.request.get(href!)).status()).toBe(403); expect((await admin.request.get(href!)).status()).toBe(200);
  await item.getByLabel('Motivul deciziei').fill('Dovadă demonstrativă verificată și aprobată.'); await item.getByRole('button', { name: 'Aprobă', exact: true }).click();
  expect((await admin.request.get(href!)).status()).toBe(404); await adminContext.close();
});
test('alumni profiles can be published and withdrawn without deleting the account', async ({ page }) => {
  await login(page, '+40700000006');
  const form = page.locator('#absolvent form'), name = `Absolvent demo ${Date.now()}`;
  await form.getByLabel('Nume public', { exact: true }).fill(name);
  await form.locator('input[name="published"]').check(); await form.getByRole('button', { name: 'Salvează profilul' }).click();
  await page.goto('/absolventi'); await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.goto('/cont'); await page.locator('#absolvent input[name="published"]').uncheck();
  await page.locator('#absolvent').getByRole('button', { name: 'Salvează profilul' }).click();
  await page.goto('/absolventi'); await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
});
test('teacher offers can be updated, disabled and reactivated', async ({ page }) => {
  await login(page, '+40700000004');
  const form = page.locator('#oferte form').filter({ has: page.locator('input[name="op"][value="offer"]') });
  await form.getByLabel('Preț (lei)', { exact: true }).fill('175');
  await form.locator('input[name="not_current_students"]').check();
  await form.getByRole('button', { name: 'Publică / actualizează oferta' }).click();
  await page.goto('/meditatii'); await expect(page.locator('.panel')).toContainText('175 lei');
  await page.goto('/cont'); await page.locator('#oferte').getByRole('button', { name: 'Dezactivează oferta' }).click();
  await page.goto('/meditatii'); await expect(page.getByRole('heading', { name: 'Nu există oferte pentru aceste filtre.' })).toBeVisible();
  await page.goto('/cont'); await form.getByLabel('Preț (lei)', { exact: true }).fill('150');
  await form.locator('input[name="not_current_students"]').check(); await form.getByRole('button', { name: 'Publică / actualizează oferta' }).click();
  await page.goto('/meditatii'); await expect(page.locator('.panel')).toContainText('150 lei');
});
test('phone layout and keyboard navigation work in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await dismissCookies(page);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Tema interfeței').selectOption(theme);
    for (const path of ['/', '/profesori', '/meditatii', '/cookies', '/autentificare']) {
      await page.goto(path); await page.getByLabel('Tema interfeței').selectOption(theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} ${theme}`).toBe(true);
    }
    await page.goto('/'); await page.getByLabel('Tema interfeței').selectOption(theme);
    await page.screenshot({ path: `test-results/home-mobile-${theme}.png`, fullPage: true });
    await page.screenshot({ path: `test-results/home-mobile-${theme}-viewport.png` });
  }
  await page.reload(); await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Sari la conținut' })).toBeFocused();
});
