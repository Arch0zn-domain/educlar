import { expect,type Page,type BrowserContext } from '@playwright/test';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
type State=Awaited<ReturnType<BrowserContext['storageState']>>;
export async function dismissCookies(page:Page) {
  await page.waitForFunction(()=>localStorage.getItem('educlar-cookies')!==null||document.querySelector('.cookie-banner')!==null);
  const button=page.getByRole('button',{name:'Doar necesare',exact:true});if(await button.isVisible())await button.click();
}
export async function login(page:Page,phone:string) {
  const baseURL=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
  const folder=path.resolve(process.env.TEST_DATA_DIR||'.data/browser-test','browser-sessions');
  if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error('Invalid synthetic login phone.');
  const file=path.join(folder,phone.slice(1)+'.json');
  await page.context().clearCookies();
  // Reuse real test sessions instead of repeatedly requesting OTPs in one minute.
  // The ignored fixture directory holds only synthetic demo authentication state.
  try {
    const saved=JSON.parse(await readFile(file,'utf8')) as {baseURL:string;state:State};
    if(saved.baseURL===baseURL) {
      await page.context().addCookies(saved.state.cookies);await page.goto('/cont');
      if(new URL(page.url()).pathname==='/cont'){await dismissCookies(page);return;}
    }
  }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  await page.context().clearCookies();await page.goto('/autentificare');await dismissCookies(page);
  await page.getByLabel('Număr de telefon',{exact:true}).fill(phone);await page.getByRole('button',{name:'Trimite codul'}).click();
  await expect(page.locator('.code-button')).toBeVisible();await page.locator('.code-button').click();
  await page.getByRole('button',{name:'Intră în cont',exact:true}).click();await expect(page).toHaveURL(/\/cont/);
  await mkdir(folder,{recursive:true});await writeFile(file,JSON.stringify({baseURL,state:await page.context().storageState()}),{mode:0o600});
}
