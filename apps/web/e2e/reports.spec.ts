import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Reports center with the synthetic demo data: role default view, KPI →
// matching list, filters kept after opening a case, stats with table
// alternative, parts clerk sees only the parts view.
async function as(page: Page, user: string) {
  await page.goto('about:blank');
  await page.context().clearCookies();
  await login(page, user);
}

test('service manager: KPI opens its list, filters survive opening a case, charts have tables', async ({ page }) => {
  await as(page, 'manager');
  await page.getByRole('link', { name: 'گزارش‌ها' }).first().click();
  await expect(page.getByRole('heading', { name: 'گزارش‌ها — مدیر خدمات' })).toBeVisible();
  await expect(page.getByText('داده آزمایشی').first()).toBeVisible();

  // The "blocked" figure equals the case list it opens.
  const blocked = page.locator('.kpi', { hasText: 'دارای مانع' });
  const value = (await blocked.locator('.kpi-value').innerText()).trim();
  await blocked.click();
  await expect(page).toHaveURL(/\/cases\?flag=blocked/);
  await expect(page.getByText(`${value} پرونده`, { exact: true })).toBeVisible();
  await page.goBack();

  // Accident view, filtered by stage; open a case from the work list and come back.
  await page.getByRole('button', { name: 'تصادفات', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'گزارش‌ها — تصادفات' })).toBeVisible();
  await page.getByLabel('مرحله').selectOption({ label: 'در حال تعمیر' });
  await expect(page).toHaveURL(/stage=in_repair/);
  const rows = page.getByTestId('work-row');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText('در حال تعمیر');
  await rows.first().getByRole('link').click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
  await page.goBack();
  await expect(page).toHaveURL(/view=accident.*stage=in_repair|stage=in_repair.*view=accident/);
  await expect(page.getByLabel('مرحله')).toHaveValue('in_repair');

  // Stats with an accessible table for each chart.
  await page.getByRole('button', { name: 'آمار و روند' }).click();
  const stages = page.getByTestId('chart-stages');
  await expect(stages).toBeVisible();
  await stages.getByText('نمایش جدول همین نمودار').click();
  await expect(stages.locator('table')).toContainText('در حال تعمیر');
  await expect(page.getByText('رویدادهای بازه', { exact: false })).toBeVisible();
});

test('parts clerk sees only the parts work list, with quantities and next actions', async ({ page }) => {
  await as(page, 'parts');
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'گزارش‌ها — انبار و قطعات' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'نوع گزارش' })).toHaveCount(0);
  await expect(page.locator('.kpi')).toHaveCount(6);
  await expect(page.locator('.kpi').first()).toContainText('درخواست قطعه');
  await expect(page.getByTestId('work-row').first()).toContainText(/بررسی موجودی|ثبت سفارش|پیگیری|تحویل به واحد/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
