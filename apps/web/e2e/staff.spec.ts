import {test,expect} from '@playwright/test';
import {login} from './helpers';

test('owner sends and retries an employee invitation from کارکنان without copying a private link',async({page},testInfo)=>{
  await login(page,'admin');
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:true}}));
  let sent=false;
  await page.route('**/api/v1/auth/invitations',r=>r.fulfill({json:sent?[{id:'synthetic',email:'worker@example.test',displayName:'همکار آزمون',roles:['accident_expert'],isActive:false,invitationDelivery:'sent',invitationExpiresAt:new Date(Date.now()+86400000).toISOString()}]:[]}));
  await page.route('**/api/v1/auth/invitations/email',async r=>{
    expect(r.request().postDataJSON()).toEqual({email:'worker@example.test',displayName:'همکار آزمون',roles:['accident_expert']});
    sent=true;await r.fulfill({json:{id:'synthetic',status:'invited',emailDelivery:'sent'}});
  });
  await page.goto('/users');await expect(page.getByRole('heading',{name:'کارکنان',exact:true})).toBeVisible();
  await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('همکار آزمون');await page.getByLabel('ایمیل',{exact:true}).fill('worker@example.test');
  await page.getByRole('button',{name:'افزودن و ارسال دعوت',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('worker@example.test');
  await expect(page.getByText('سرور ایمیل دعوت را پذیرفت؛ در انتظار فعال‌سازی',{exact:false})).toBeVisible();
  await expect(page.getByText('لینک دعوت محرمانه')).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('staff-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'ارسال دوباره دعوت برای همکار آزمون'}).click();
  await expect(page.getByRole('status')).toContainText('سرور ایمیل دعوت‌نامه');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('staff-mobile.png'),fullPage:true});
});

test('staff form explains mail configuration and server-side failure without claiming success',async({page})=>{
  await login(page,'admin');
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:true}}));
  await page.route('**/api/v1/auth/invitations/email',r=>r.fulfill({json:{emailDelivery:'failed'}}));
  await page.goto('/users');
  await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('همکار آزمون');await page.getByLabel('ایمیل',{exact:true}).fill('worker@example.test');
  await page.getByRole('button',{name:'افزودن و ارسال دعوت',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'کارمند ثبت شد'})).toContainText('ارسال ایمیل موفق نبود');
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:false}}));
  await page.reload();await expect(page.getByRole('button',{name:'افزودن و ارسال دعوت',exact:true})).toBeDisabled();
  await expect(page.getByText('ارسال ایمیل دعوت هنوز تنظیم نشده است.',{exact:false})).toBeVisible();
});

test('owner can invite privately while email setup is unavailable',async({page})=>{
  await login(page,'admin');
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:false}}));
  await page.goto('/users');await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('همکار موقت');
  await page.getByLabel('ایمیل',{exact:true}).fill('private-worker@example.test');
  await page.getByRole('button',{name:'ساخت لینک دعوت خصوصی',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'لینک خصوصی برای'})).toContainText('ایمیلی ارسال نشده است');
  await expect(page.getByLabel('لینک دعوت محرمانه',{exact:true})).toHaveValue(/\/activate#token=/);
  await expect(page.getByRole('heading',{name:'همکار موقت',exact:true})).toBeVisible();
});

test('owner sees why email failed and can check the connection without sending',async({page})=>{
  await login(page,'admin');
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:true}}));
  await page.route('**/api/v1/auth/invitations',r=>r.fulfill({json:[{id:'synthetic',email:'worker@example.test',displayName:'همکار آزمون',roles:['accident_expert'],isActive:false,invitationDelivery:'failed',invitationFailure:'connection_blocked',invitationExpiresAt:new Date(Date.now()+86400000).toISOString()}]}));
  let checks=0;
  await page.route('**/api/v1/auth/invitations/email/check',r=>{checks++;return r.fulfill({json:{status:'failed',failure:'connection_blocked'}});});
  await page.goto('/users');
  await expect(page.getByText('علت: سرور Manage به سرور ایمیل وصل نشد',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'بررسی اتصال ایمیل'}).click();
  await expect(page.getByTestId('mail-check')).toContainText('مشکل شبکه سرور است');
  expect(checks).toBe(1);
  await expect(page.getByRole('button',{name:'ساخت لینک خصوصی برای همکار آزمون'})).toBeEnabled();
});
