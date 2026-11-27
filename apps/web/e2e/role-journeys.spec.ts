import { expect, test, type Page } from '@playwright/test';
import { login, openCaseTab } from './helpers';

// Package 8: one journey per role on the new interface (spec §2, §3, §6, §10, §12),
// with a desktop and a 390px screenshot of every screen. Synthetic demo data only.
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function shots(page: Page, name: string, outputPath: (n: string) => string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: outputPath(`${name}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSideways(page)).toBe(true);
  await page.screenshot({ path: outputPath(`${name}-390.png`), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('login has exactly two doors and never says «مالک»', async ({ page }, info) => {
  await page.goto('/login');
  const tabs = page.getByRole('tablist', { name: 'نوع ورود' }).getByRole('tab');
  await expect(tabs).toHaveText(['ورود کارکنان', 'ورود مدیر سیستم']);
  await expect(page.locator('main')).not.toContainText('مالک');
  await expect(page.getByText('هر خودرو،', { exact: false })).toBeVisible();
  await shots(page, 'login', (n) => info.outputPath(n));
});

test('accident expert: folder desk → case folder → tabs and «قدم بعدی شما»', async ({ page }, info) => {
  await login(page, 'expert');
  await page.goto('/accidents/expert');
  await expect(page.getByRole('heading', { level: 1, name: 'میز تصادفات' })).toBeVisible();
  const rows = page.getByTestId('accident-row');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().locator('.arow-next')).toContainText('قدم بعدی');
  await shots(page, 'expert-desk', (n) => info.outputPath(n));
  // A row opens only through its own «کارهای ضروری» link (one clear action per row; rare ones in «⋯»).
  await rows.first().getByRole('link', { name: /^کارهای ضروری/ }).click();
  await expect(page.locator('.case-hero')).toBeVisible();
  await expect(page.getByRole('list', { name: 'مسیر خودرو' }).getByRole('listitem')).toHaveCount(6);
  for (const tab of ['قطعات', 'مدارک', 'تاریخچه']) await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
  await openCaseTab(page, 'کار امروز');
  await expect(page.getByRole('button', { name: 'ساخت مسیر تعمیر' })).toBeVisible();
  await shots(page, 'case-folder', (n) => info.outputPath(n));
  await openCaseTab(page, 'قطعات');
  await expect(page.getByTestId('parts-ledger')).toBeVisible();
  await openCaseTab(page, 'مدارک');
  await expect(page.locator('#case-info')).toBeAttached();
});

test('parts clerk: parts desk with the cars, the unified list of the selected car and stock', async ({ page }, info) => {
  await login(page, 'parts');
  await page.goto('/accidents/parts');
  await expect(page.getByRole('heading', { level: 1, name: 'میز قطعات' })).toBeVisible();
  const cars = page.getByRole('complementary', { name: 'خودروها و وضعیت' });
  await expect(cars.getByRole('region', { name: 'وضعیت موجودی' })).toBeVisible();
  await expect(page.getByTestId('parts-ledger')).toBeVisible();
  await expect(page.getByTestId('parts-ledger').getByRole('heading', { level: 2, name: /^قطعات/ })).toBeVisible();
  await shots(page, 'parts-desk', (n) => info.outputPath(n));
  // The same desk is the «قطعات» destination of the sidebar.
  await page.goto('/parts');
  await expect(page.getByRole('heading', { level: 1, name: 'میز قطعات' })).toBeVisible();
});

test('technician on a phone: no wage, one big button', async ({ page }, info) => {
  await login(page, 'technician');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workshop/technician');
  await expect(page.getByRole('heading', { level: 1, name: /^سلام/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'اجرت این ماه' })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('اجرت');
  expect(await noSideways(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('technician-390.png'), fullPage: true });
});

test('service manager: control room with four numbers, funnel, map and «فیدبک»', async ({ page }, info) => {
  await login(page, 'manager');
  await page.goto('/accidents/manager');
  const room = page.getByTestId('control-room');
  await expect(room.getByRole('heading', { name: 'اتاق کنترل مدیر خدمات' })).toBeVisible();
  await expect(room.locator('.sd-kpi')).toHaveCount(4);
  await expect(room.locator('.cr-funnel li')).toHaveCount(5);
  await expect(room.locator('.cr-funnel li.neck')).toHaveCount(1);
  await expect(room.getByRole('region', { name: 'تحلیل امروز' }).locator('li').first()).toBeVisible();
  await room.getByRole('button', { name: 'این هفته' }).click();
  await expect(room.getByRole('button', { name: 'این هفته' })).toHaveAttribute('aria-pressed', 'true');
  await shots(page, 'control-room', (n) => info.outputPath(n));
  // The live workshop map is drawn from the bays; choosing a bay lists its cars as links.
  await expect(room.getByTestId('workshop-scene')).toBeVisible();
  const bay = room.getByTestId('workshop-scene').getByRole('button').first();
  await bay.focus();
  await page.keyboard.press('Enter');
  await expect(bay).toHaveAttribute('aria-pressed', 'true');
  await expect(room.getByTestId('bay-detail')).toBeVisible();
  await room.getByRole('button', { name: 'ارسال فیدبک', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // Display only: no operational button anywhere in the room.
  await page.keyboard.press('Escape');
  await expect(room.getByRole('button', { name: /^(رزرو|شروع کار|تأیید|ثبت)/ })).toHaveCount(0);
});

test('system administrator: «گره‌ها» first, report status and alert thresholds', async ({ page }, info) => {
  await login(page, 'admin');
  await page.goto('/accidents/admin');
  await expect(page.locator('.desk-kicker')).toHaveText('میز پشتیبانی مدیر سیستم');
  await expect(page.getByRole('button', { name: /^گره‌ها/ })).toHaveAttribute('aria-pressed', 'true');
  await shots(page, 'admin-desk', (n) => info.outputPath(n));
  // Settings hub: every settings area of the account in one place, each a real page.
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'تنظیمات' })).toBeVisible();
  await page.getByRole('link', { name: /^کارگاه/ }).click();
  await expect(page).toHaveURL(/\/workshop\/settings$/);
  await expect(page.getByRole('link', { name: 'بازگشت به تنظیمات' })).toBeVisible();
  await expect(page.getByText('امداد ویژهٔ دیرشده بعد از', { exact: false })).toBeVisible();
});
