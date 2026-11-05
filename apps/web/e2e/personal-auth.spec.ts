import {test,expect} from '@playwright/test';
import {login} from './helpers';

// UI contract checks use synthetic challenge responses. Server-side TOTP,
// replay prevention and session issuance are tested in the API suite.
test('personal login asks for the Authenticator code after the password',async({page})=>{
  await login(page,'manager');
  const me=await (await page.request.get('/api/v1/auth/me')).json();
  await page.route('**/api/v1/auth/options',r=>r.fulfill({json:{totpEnabled:true}}));
  await page.route('**/api/v1/auth/email/login',async r=>{
    expect(r.request().postDataJSON().email).toBe('owner@example.test');
    await r.fulfill({json:{challengeId:'00000000-0000-4000-8000-000000000000',proof:'x'.repeat(43),expiresIn:300}});
  });
  await page.route('**/api/v1/auth/email/verify',async r=>{
    expect(r.request().postDataJSON().code).toBe('123456');await r.fulfill({json:{...me,authentication:'totp'}});
  });
  await page.goto('/login');await page.getByLabel('ایمیل کاری',{exact:true}).fill('owner@example.test');
  await page.getByLabel('رمز عبور',{exact:true}).fill('synthetic-personal-password');
  await page.getByRole('button',{name:'ادامه',exact:true}).click();
  await page.getByLabel('کد تأیید',{exact:true}).fill('۱۲۳۴۵۶');
  await expect(page.getByLabel('کد تأیید',{exact:true})).toHaveValue('123456');
  await page.getByRole('button',{name:'تأیید کد و ورود',exact:true}).click();
  await expect(page).toHaveURL(/\/launch$/);
  await page.getByRole('navigation',{name:'میزهای کار مجاز من'}).getByRole('link',{name:/مدیر خدمات/}).click();
  await expect(page.getByRole('heading',{name:'میز کار مدیر خدمات'})).toBeVisible();
});

test('invitation setup explains QR enrollment and confirms the first code',async({page})=>{
  await page.route('**/api/v1/auth/invitations/accept',r=>r.fulfill({json:{challengeId:'00000000-0000-4000-8000-000000000000',proof:'x'.repeat(43),secret:'SYNTHETIC-TEST-ONLY',qrDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X0AAAAASUVORK5CYII='}}));
  await page.route('**/api/v1/auth/invitations/confirm',async r=>{expect(r.request().postDataJSON().code).toBe('123456');await r.fulfill({json:{status:'ok'}});});
  await page.goto('/activate#token=00000000-0000-4000-8000-000000000000.'+'x'.repeat(43));
  await page.getByLabel('رمز شخصی جدید',{exact:true}).fill('synthetic-personal-password');
  await page.getByRole('button',{name:'ادامه و اتصال Authenticator',exact:true}).click();
  await expect(page.getByRole('heading',{name:'اتصال Google Authenticator'})).toBeVisible();
  await page.getByLabel('کد شش‌رقمی Authenticator',{exact:true}).fill('123456');
  await page.getByRole('button',{name:'تأیید و فعال‌سازی حساب',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('حساب فعال شد');
});

test('owner makes a private recovery link for a colleague, never for the owner account',async({page})=>{
  await login(page,'manager');
  const me=await (await page.request.get('/api/v1/auth/me')).json();
  await page.route('**/api/v1/auth/me',r=>r.fulfill({json:{...me,isOwner:true}}));
  const colleague='00000000-0000-4000-8000-000000000001';
  await page.route('**/api/v1/auth/invitations',r=>r.fulfill({json:[
    {id:me.id,email:'owner@example.test',displayName:'مالک آزمون',roles:['service_manager'],isActive:true,invitationDelivery:'manual',invitationFailure:null,invitationExpiresAt:null},
    {id:colleague,email:'worker@example.test',displayName:'همکار آزمون',roles:['parts_clerk'],isActive:true,invitationDelivery:'manual',invitationFailure:null,invitationExpiresAt:null},
  ]}));
  await page.route('**/api/v1/auth/invitations/email/status',r=>r.fulfill({json:{configured:false}}));
  const link='https://manage.example.test/activate#token=00000000-0000-4000-8000-000000000000.'+'x'.repeat(43)+'&mode=recovery';
  let issued=0;
  await page.route('**/api/v1/auth/users/*/recovery',async r=>{expect(r.request().url()).toContain(colleague);issued++;await r.fulfill({status:201,json:{recoveryUrl:link,expiresAt:'2030-01-01T00:00:00.000Z'}});});
  await page.goto('/users');
  await expect(page.getByRole('button',{name:'بازیابی دسترسی مالک آزمون'})).toHaveCount(0);
  await page.getByRole('button',{name:'بازیابی دسترسی همکار آزمون'}).click();
  const dialog=page.getByRole('dialog',{name:'بازیابی دسترسی همکار آزمون'});
  await expect(dialog).toContainText('هویت این همکار');
  expect(issued).toBe(0);
  await dialog.getByRole('button',{name:'ساخت لینک بازیابی'}).click();
  await expect(dialog.getByLabel('لینک بازیابی محرمانه')).toHaveValue(link);
  expect(issued).toBe(1);
  await dialog.getByRole('button',{name:'بستن'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('لینک بازیابی محرمانه')).toHaveCount(0);
});

test('a staff member without owner rights sees no recovery action',async({page})=>{
  await login(page,'admin');
  await page.route('**/api/v1/auth/invitations',r=>r.fulfill({json:[{id:'00000000-0000-4000-8000-000000000001',email:'worker@example.test',displayName:'همکار آزمون',roles:['parts_clerk'],isActive:true,invitationDelivery:'manual',invitationFailure:null,invitationExpiresAt:null}]}));
  await page.goto('/users');
  await expect(page.getByRole('heading',{name:'همکار آزمون'})).toBeVisible();
  await expect(page.getByRole('button',{name:/بازیابی دسترسی/})).toHaveCount(0);
});

test('recovery link explains the recovery, keeps the token out of the address bar and finishes',async({page})=>{
  await page.route('**/api/v1/auth/invitations/accept',async r=>{expect(r.request().postDataJSON().token).toBe('00000000-0000-4000-8000-000000000000.'+'x'.repeat(43));await r.fulfill({status:201,json:{challengeId:'00000000-0000-4000-8000-000000000000',proof:'x'.repeat(43),secret:'SYNTHETIC-TEST-ONLY',qrDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='}});});
  await page.route('**/api/v1/auth/invitations/confirm',r=>r.fulfill({status:201,json:{status:'ok'}}));
  await page.goto('/activate#token=00000000-0000-4000-8000-000000000000.'+'x'.repeat(43)+'&mode=recovery');
  await expect(page.getByRole('heading',{name:'بازیابی دسترسی'})).toBeVisible();
  await expect(page).toHaveURL(/\/activate$/);
  await page.getByLabel('رمز شخصی جدید',{exact:true}).fill('synthetic-personal-password');
  await page.getByRole('button',{name:'ادامه و اتصال Authenticator',exact:true}).click();
  await expect(page.getByText('ورودی قدیمی Manage',{exact:false})).toBeVisible();
  await page.getByLabel('کد شش‌رقمی Authenticator',{exact:true}).fill('123456');
  await page.getByRole('button',{name:'تأیید و بازیابی دسترسی',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('نشست‌های قبلی');
});

test('forgot-password page explains the real recovery path',async({page})=>{
  await page.goto('/reset-password');
  await expect(page.getByRole('heading',{name:'بازیابی دسترسی'})).toBeVisible();
  await expect(page.getByText('مالک پس از تأیید هویت شما',{exact:false})).toBeVisible();
  await expect(page.locator('main input')).toHaveCount(0);
});
