import { test, expect } from '@playwright/test';

test('Jelly is reachable from navigation and offers sign-in without calling the provider',async({page})=>{
  await page.goto('/asistent');
  await page.getByRole('button',{name:'Doar necesare',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Cu ce te pot ajuta?'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Intră în cont',exact:true}).last()).toBeVisible();
  await expect(page.getByRole('button',{name:'Deschide Jelly'})).toHaveCount(0);
  await page.goto('/');await page.getByRole('button',{name:'Deschide Jelly'}).click();
  await expect(page.getByRole('region',{name:'Jelly, asistent AI'})).toBeVisible();
  await page.getByRole('button',{name:'Închide asistentul',exact:true}).click();
  await expect(page.getByRole('button',{name:'Deschide Jelly'})).toBeFocused();
});

test('Jelly sends bounded context, keeps failed drafts, shows saved replies and clears on mobile',async({page})=>{
  await page.goto('/autentificare');await page.getByRole('button',{name:'Doar necesare',exact:true}).click();
  await page.getByRole('button',{name:'Părinte +40700000002',exact:false}).click();
  await page.getByRole('button',{name:'Trimite codul',exact:true}).click();
  await page.locator('.code-button').click();await page.getByRole('button',{name:'Intră în cont',exact:true}).click();
  await expect(page).toHaveURL(/\/cont/);
  const payloads: any[] = [];let cleared = false;
  await page.route('**/api/chat',async route=>{
    const method = route.request().method();
    if(method==='DELETE'){cleared=true;return route.fulfill({json:{cleared:true}});}
    if(method==='GET')return route.fulfill({json:{configured:true,remaining:20,dailyLimit:20,available:true}});
    payloads.push(route.request().postDataJSON());
    if(payloads.length===2)return route.fulfill({status:503,json:{error:'Furnizorul este temporar indisponibil.'}});
    return route.fulfill({json:{reply:'Un răspuns de test, fără a consuma tokenuri.',cached:payloads.length>2,remaining:19,dailyLimit:20,available:true}});
  });
  await page.goto('/asistent');const input=page.getByRole('textbox',{name:'Mesaj pentru Jelly'});
  await expect(input).toBeEnabled();await input.fill('Ajută-mă cu o idee.');await page.getByRole('button',{name:'Trimite mesajul'}).click();
  await expect(page.locator('.assistant-message')).toHaveCount(2);
  expect(payloads[0]).toEqual({messages:[{role:'user',content:'Ajută-mă cu o idee.'}]});
  await page.screenshot({path:'test-results/assistant-desktop.png',fullPage:true});
  await input.fill('Mai explică un pic.');await input.press('Enter');
  await expect(page.locator('.assistant-compose').getByRole('alert')).toContainText('temporar');await expect(input).toHaveValue('Mai explică un pic.');
  await page.getByRole('button',{name:'Trimite mesajul'}).click();
  await expect(page.locator('.assistant-message')).toHaveCount(4);
  expect(payloads[2].messages.map((m:any)=>m.role)).toEqual(['user','assistant','user']);
  await expect(page.getByText('Răspuns salvat · fără un apel AI nou')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/assistant-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Șterge conversația și răspunsurile salvate'}).click();
  await expect(page.locator('.assistant-message')).toHaveCount(0);expect(cleared).toBe(true);
});
