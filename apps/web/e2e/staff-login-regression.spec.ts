import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('synthetic EXP00: fresh browser, PIN only, parts desk, reload and second sign-in', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page, 'admin');
  const created = await page.request.post('/api/v1/staff/technicians', { headers: { 'x-manage-client': 'test' }, data: { displayName: 'مسئول قطعات ساختگی', role: 'parts_clerk', personnelCode: '00', pin: '4815' } });
  expect(created.status()).toBe(201);
  await page.context().clearCookies();
  await page.goto('/login');
  const form = page.locator('#login-panel-technician');
  await form.getByLabel('نام کاربری', { exact: true }).fill('EXP ۰۰');
  for (const [index, digit] of [...'۴۸۱۵'].entries()) await form.getByLabel(`رقم ${['۱', '۲', '۳', '۴'][index]} رمز`, { exact: true }).fill(digit);
  // First sign-in on a fresh browser: the PIN alone is enough (spec section 3).
  await form.getByRole('button', { name: 'ورود به میز کار', exact: true }).click();
  await expect(page).toHaveURL(/\/launch$/);
  await expect(page.getByRole('heading', { name: 'از میز کار خود شروع کنید.' })).toBeVisible();
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  expect(me.username).toBe('exp00');
  expect(me.roles).toEqual(['parts_clerk']);
  expect(me.permissions).not.toContain('user.manage');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'از میز کار خود شروع کنید.' })).toBeVisible();
  await page.getByRole('navigation', {name:'میزهای کار مجاز من'}).getByRole('link', { name: /^مسئول قطعات/ }).click();
  await expect(page).toHaveURL(/\/accidents\/parts$/);
  // Keep only the registered-device cookie; no user's PIN is read or reset.
  const device = (await page.context().cookies()).filter(cookie => cookie.name === 'manage_device');
  await page.context().clearCookies();
  await page.context().addCookies(device);
  await page.goto('/login');
  await form.getByLabel('نام کاربری', { exact: true }).fill('EXP00');
  for (const [index, digit] of [...'4815'].entries()) await form.getByLabel(`رقم ${['۱', '۲', '۳', '۴'][index]} رمز`, { exact: true }).fill(digit);
  await form.getByRole('button', { name: 'ورود به میز کار', exact: true }).click();
  await expect(page).toHaveURL(/\/launch$/);
  await expect(page.getByRole('heading', { name: 'از میز کار خود شروع کنید.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('expired session returns to sign-in instead of an endless loading screen', async ({ page }) => {
  await page.goto('/launch');
  await expect(page).toHaveURL(/\/login\?next=%2Flaunch$/);
  await expect(page.getByRole('heading', { name: 'ورود کارکنان', exact: true })).toBeVisible();
});

test('a stalled PIN request times out and unlocks the form', async ({ page }) => {
  await page.route('**/api/v1/auth/technician-login', () => {});
  await page.goto('/login');
  const form = page.locator('#login-panel-technician');
  await form.getByLabel('نام کاربری', { exact: true }).fill('EXP00');
  for (const [index, digit] of [...'4815'].entries()) await form.getByLabel(`رقم ${['۱', '۲', '۳', '۴'][index]} رمز`, { exact: true }).fill(digit);
  await form.getByRole('button', { name: 'ورود به میز کار', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('پاسخ سرور دیر شد', { timeout: 25_000 });
  await expect(form.getByRole('button', { name: 'ورود به میز کار', exact: true })).toBeEnabled();
});

test('session service failure offers retry and then loads the same account', async ({ page }) => {
  await login(page, 'admin');
  await page.route('**/api/v1/auth/me', route => route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'خطای ساختگی اتصال' } }));
  await page.goto('/launch');
  await expect(page.getByRole('alert').filter({hasText:'خطای ساختگی اتصال'})).toContainText('خطای ساختگی اتصال');
  await page.unroute('**/api/v1/auth/me');
  await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'از میز کار خود شروع کنید.' })).toBeVisible();
});
