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
  await page.goto('/login');await page.getByLabel('ایمیل',{exact:true}).fill('owner@example.test');
  await page.getByLabel('رمز عبور',{exact:true}).fill('synthetic-personal-password');
  await page.getByRole('button',{name:'ادامه',exact:true}).click();
  await page.getByLabel('کد تأیید',{exact:true}).fill('۱۲۳۴۵۶');
  await expect(page.getByLabel('کد تأیید',{exact:true})).toHaveValue('123456');
  await page.getByRole('button',{name:'تأیید کد و ورود',exact:true}).click();
  await expect(page.getByRole('heading',{name:'وضعیت تعمیرگاه'})).toBeVisible();
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
