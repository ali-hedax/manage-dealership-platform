import {test,expect} from '@playwright/test';
import {login} from './helpers';

test('owner sends and retries an employee invitation from کارکنان without copying a private link',async({page},testInfo)=>{
  await login(page,'admin');
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:true}}));
  let sent=false;
  await page.route('**/api/v1/auth/invitations',r=>r.fulfill({json:sent?[{id:'synthetic',email:'worker@example.test',displayName:'همکار آزمون',roles:['accident_coordinator'],isActive:false,invitationDelivery:'sent',invitationExpiresAt:new Date(Date.now()+86400000).toISOString()}]:[]}));
  await page.route('**/api/v1/auth/invitations/email',async r=>{
    expect(r.request().postDataJSON()).toEqual({email:'worker@example.test',displayName:'همکار آزمون',roles:['accident_coordinator']});
    sent=true;await r.fulfill({json:{id:'synthetic',status:'invited',emailDelivery:'sent'}});
  });
  await page.goto('/users');await expect(page.getByRole('heading',{name:'کارکنان',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'افزودن کارمند',exact:true}).click();
  await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('همکار آزمون');await page.getByLabel('ایمیل',{exact:true}).fill('worker@example.test');
  await page.getByRole('button',{name:'افزودن و ارسال دعوت',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('worker@example.test');
  await expect(page.getByText('دعوت ایمیل شد؛ در انتظار فعال‌سازی',{exact:false})).toBeVisible();
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
  await page.goto('/users');await page.getByRole('button',{name:'افزودن کارمند',exact:true}).click();
  await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('همکار آزمون');await page.getByLabel('ایمیل',{exact:true}).fill('worker@example.test');
  await page.getByRole('button',{name:'افزودن و ارسال دعوت',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'کارمند ثبت شد'})).toContainText('ارسال ایمیل موفق نبود');
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:false}}));
  await page.reload();await page.getByRole('button',{name:'افزودن کارمند',exact:true}).click();
  // Without a mail sender the private link is the only (primary) way to invite.
  await expect(page.getByRole('button',{name:'افزودن و ارسال دعوت',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'ساخت لینک دعوت خصوصی',exact:true})).toBeEnabled();
  await expect(page.getByText('ارسال خودکار ایمیل فعلاً ممکن نیست',{exact:false})).toBeVisible();
});

test('owner can invite privately while email setup is unavailable',async({page})=>{
  await login(page,'admin');
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:false}}));
  await page.goto('/users');await page.getByRole('button',{name:'افزودن کارمند',exact:true}).click();await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('همکار موقت');
  await page.getByLabel('ایمیل',{exact:true}).fill('private-worker@example.test');
  await page.getByRole('button',{name:'ساخت لینک دعوت خصوصی',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'لینک خصوصی برای'})).toContainText('ایمیلی ارسال نشده است');
  await expect(page.getByLabel('لینک دعوت محرمانه',{exact:true})).toHaveValue(/\/activate#token=/);
  await expect(page.getByRole('heading',{name:'همکار موقت',exact:true})).toBeVisible();
});

test('owner sees why email failed and can check the connection without sending',async({page})=>{
  await login(page,'admin');
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:true}}));
  await page.route('**/api/v1/auth/invitations',r=>r.fulfill({json:[{id:'synthetic',email:'worker@example.test',displayName:'همکار آزمون',roles:['accident_coordinator'],isActive:false,invitationDelivery:'failed',invitationFailure:'connection_blocked',invitationExpiresAt:new Date(Date.now()+86400000).toISOString()}]}));
  let checks=0;
  await page.route('**/api/v1/auth/invitations/email/check',r=>{checks++;return r.fulfill({json:{status:'failed',failure:'connection_blocked'}});});
  await page.goto('/users');
  await expect(page.getByText('علت: سرور Manage به سرور ایمیل وصل نشد',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'افزودن کارمند',exact:true}).click();
  await page.getByRole('button',{name:'بررسی اتصال ایمیل'}).click();
  await expect(page.getByTestId('mail-check')).toContainText('مشکل شبکه سرور است');
  expect(checks).toBe(1);
  await expect(page.getByRole('button',{name:'ساخت لینک خصوصی برای همکار آزمون'})).toBeEnabled();
});

test('technicians get their own tab: name, unit, bay code and a 4-digit PIN, and the technician signs in with them',async({page},testInfo)=>{
  await login(page,'admin');
  await page.goto('/users');
  await page.getByRole('tab',{name:/تعمیرکارها/}).click();
  await expect(page).toHaveURL(/\/users#technicians$/);
  const panel=page.getByRole('tabpanel');
  await expect(panel.getByRole('heading',{name:'تعمیرکارها',exact:true})).toBeVisible();
  await expect(panel.getByLabel('ایمیل')).toHaveCount(0);
  await panel.getByLabel('نام تعمیرکار',{exact:true}).fill('صافکار تصویری آزمون');
  await panel.getByRole('combobox',{name:'واحد',exact:true}).selectOption({label:'صافکاری'});
  await panel.getByLabel('کد جایگاه',{exact:true}).fill('B-77');
  await panel.getByLabel('رمز ۴ رقمی',{exact:true}).fill('۴۸۱۵');
  const username=(await panel.locator('.technician-username bdi').textContent())!.trim();
  expect(username).toMatch(/^tech\d{2,}$/);
  await panel.getByRole('button',{name:'افزودن تعمیرکار',exact:true}).click();
  const created=panel.locator('.technician-created');
  await expect(created).toContainText('صافکار تصویری آزمون ساخته شد');
  await expect(created).toContainText(username);
  await expect(created).toContainText('۴۸۱۵');
  await expect(created).toContainText('صافکاری · B-77');
  const row=panel.getByRole('row',{name:/صافکار تصویری آزمون/});
  await expect(row).toContainText('فعال');
  await expect(row).toContainText('صافکاری · B-77');
  await page.screenshot({path:testInfo.outputPath('technicians-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('technicians-mobile.png'),fullPage:true});

  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByRole('tab',{name:'تعمیرکار',exact:true}).click();
  const form=page.locator('#login-panel-technician');
  await form.getByLabel('نام کاربری',{exact:true}).fill(username);
  for(const [i,d] of ['4','8','1','5'].entries())await form.getByLabel(`رقم ${['۱','۲','۳','۴'][i]} رمز`,{exact:true}).fill(d);
  await form.getByRole('button',{name:/ورود/}).click();
  await expect(page).toHaveURL(/\/workshop\/technician$/);
});
