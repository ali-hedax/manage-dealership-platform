import {test,expect} from '@playwright/test';
import {login} from './helpers';

test('public installation metadata and icons are valid without exposing account-specific data',async({page})=>{
 await page.goto('/login');
 await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href','/manifest.webmanifest');
 const response=await page.request.get('/manifest.webmanifest');expect(response.ok()).toBe(true);
 expect(response.headers()['content-type']).toContain('application/manifest+json');
 const manifest=await response.json();
 expect(manifest).toMatchObject({id:'/',start_url:'/launch',scope:'/',display:'standalone',lang:'fa',dir:'rtl'});
 expect(manifest.icons.map((i:{sizes:string})=>i.sizes)).toEqual(expect.arrayContaining(['192x192','512x512']));
 expect(manifest.icons.some((i:{purpose:string})=>i.purpose==='maskable')).toBe(true);
 for(const icon of manifest.icons){
  const iconResponse=await page.request.get(icon.src);expect(iconResponse.ok()).toBe(true);
  const bytes=await iconResponse.body();expect(bytes.readUInt32BE(16)).toBe(Number(icon.sizes.split('x')[0]));expect(bytes.readUInt32BE(20)).toBe(Number(icon.sizes.split('x')[1]));
 }
 await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href','/brand/apple-touch-icon.png');
 expect(await page.evaluate(async()=>('serviceWorker' in navigator)?(await navigator.serviceWorker.getRegistrations()).length:0)).toBe(0);
});

test('phone installation guide uses an optional native prompt, is keyboard accessible and never submits login',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/login');
 await page.getByRole('button',{name:'نصب روی گوشی',exact:true}).click();
 const guide=page.getByRole('dialog',{name:'نصب Manage روی دستگاه',exact:true});
 await expect(guide).toBeVisible();await expect(guide.getByText('نصب روی اندروید',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('install-android-guide.png'),fullPage:true});
 await page.keyboard.press('Escape');await expect(guide).not.toBeVisible();await expect(page.getByRole('button',{name:'نصب روی گوشی',exact:true})).toBeFocused();
 // The browser owns real installation. This synthetic event tests our progressive enhancement contract.
 await page.evaluate(()=>{
  const event=new Event('beforeinstallprompt',{cancelable:true});
  Object.assign(event,{prompt:async()=>{document.documentElement.dataset.prompted='yes';},userChoice:Promise.resolve({outcome:'dismissed'})});window.dispatchEvent(event);
 });
 await page.getByRole('button',{name:'نصب روی گوشی',exact:true}).click();
 await guide.getByRole('button',{name:'نصب برنامه',exact:true}).click();
 await expect(guide.getByRole('status')).toContainText('نصب انجام نشد');
 await expect(page.locator('html')).toHaveAttribute('data-prompted','yes');
 await expect(guide.getByRole('button',{name:'نصب برنامه',exact:true})).toHaveCount(0);
 await expect(page).toHaveURL(/\/login$/);
 await page.evaluate(()=>{
  const event=new Event('beforeinstallprompt',{cancelable:true});
  Object.assign(event,{prompt:async()=>{},userChoice:Promise.resolve({outcome:'accepted'})});window.dispatchEvent(event);
 });
 await guide.getByRole('button',{name:'نصب برنامه',exact:true}).click();
 await expect(guide.getByRole('status')).toContainText('درخواست نصب تأیید شد');
 await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
 await expect(guide.getByRole('status')).toContainText('Manage نصب شد');
 await guide.getByRole('button',{name:'بستن راهنما',exact:true}).click();
 await expect(page.getByRole('button',{name:'نصب روی گوشی',exact:true})).toHaveCount(0);
});

test('iPhone installation has manual Safari instructions and the installed window hides the install action',async({browser,baseURL},info)=>{
 const context=await browser.newContext({baseURL,locale:'fa-IR',timezoneId:'Asia/Tehran',viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 const page=await context.newPage();
 try{
  await page.goto('/login');await page.getByRole('button',{name:'نصب روی گوشی',exact:true}).click();
  const guide=page.getByRole('dialog',{name:'نصب Manage روی دستگاه',exact:true});
  await expect(guide.getByText('نصب روی آیفون و آیپد',{exact:true})).toBeVisible();
  await expect(guide).toContainText('Add to Home Screen');
  await expect(guide.getByRole('button',{name:'نصب برنامه',exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('install-iphone-guide.png'),fullPage:true});
  await context.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true,configurable:true});});
  await page.reload();await expect(page.getByRole('heading',{name:'ورود به Manage',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'نصب روی گوشی',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});

test('installed launch uses the account desk and an offline technician action is never shown as successful',async({page},info)=>{
 await login(page,'technician');await page.goto('/launch');await expect(page).toHaveURL(/\/workshop\/technician$/);
 const task={id:'00000000-0000-4000-8000-000000000001',caseId:'00000000-0000-4000-8000-000000000002',caseNumber:'TEST-01',vehicleLabel:'خودرو ساختگی نصب',plate:'TEST-PLATE',title:'کار ساختگی اتصال',departmentName:'صافکاری',status:'pending',version:1,canStart:true,plannedEndAt:null};
 await page.route('**/api/v1/workshop/my-tasks',r=>r.fulfill({json:[task]}));
 await page.route('**/api/v1/workshop/my-tasks/*/actions',r=>r.abort('internetdisconnected'));
 await page.reload();await expect(page.getByRole('button',{name:'شروع کار',exact:true})).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});
 await expect(page.getByRole('alert').filter({hasText:'اتصال شبکه قطع است'})).toBeVisible();
 await page.getByRole('button',{name:'شروع کار',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'ارتباط با سرور برقرار نشد'})).toBeVisible();
 await expect(page.getByText('شروع کار ثبت شد.',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'شروع کار',exact:true})).toBeEnabled();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('technician-offline.png'),fullPage:true});
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
 await expect(page.getByRole('alert').filter({hasText:'اتصال شبکه قطع است'})).toHaveCount(0);
 await login(page,'manager');await page.goto('/launch');await expect(page).toHaveURL(/\/accidents\/manager$/);
});
