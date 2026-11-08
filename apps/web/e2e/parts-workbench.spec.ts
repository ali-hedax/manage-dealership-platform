import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('parts workbench opens by default and keeps legacy queues usable at 390px', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'parts');
  await page.goto('/accidents/parts');
  await expect(page.getByRole('heading', { name: /امروز .* کار با شماست/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'بارگذاری گزارش امداد ویژهٔ امروز' })).toHaveAttribute('href', '/daily-reports?kind=emdad');
  await expect(page.getByText('منتظر تصمیم شما', { exact: true })).toBeVisible();
  await expect(page.getByTestId('daily-status')).toBeHidden();
  await page.screenshot({ path: info.outputPath('parts-workbench-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('parts-workbench-mobile.png'), fullPage: true });
  await page.getByText('همهٔ صف‌ها', { exact: true }).click();
  await expect(page.getByTestId('daily-status')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Manage grouped planning is available without auto-ordering or unwanted form expansion', async ({ page }) => {
  await login(page, 'parts');
  await page.goto('/accidents/parts');
  await expect(page.getByRole('heading', { name: /امروز .* کار با شماست/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /پیگیری امداد ویژه/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'برنامه‌ریزی همهٔ قطعات این خودرو با منیج' }).first()).toBeHidden();
});
