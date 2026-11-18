import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Release v1.0.0 (owner, 2026-11-18): version indicator, one-time announcement, release notes, inspection print button.
test('version indicator, one-time announcement and the complete Persian release notes', async ({ page }, info) => {
  await login(page, 'expert');
  await page.goto('/accidents/expert');
  const chip = page.getByTestId('version-chip');
  await expect(chip).toContainText(/v\d+\.\d+\.\d+/);
  const notice = page.getByTestId('release-notice');
  await expect(notice).toContainText('نسخه جدید منیج منتشر شد');
  await expect(page.getByTestId('print-inspection')).toHaveAttribute('href', '/api/v1/print/inspection.pdf');
  await page.screenshot({ path: info.outputPath('release-notice-desktop.png') });
  await notice.getByRole('link', { name: 'مشاهده تغییرات' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'تاریخچهٔ نسخه‌ها' })).toBeVisible();
  const first = page.getByTestId('release').first();
  await expect(first).toContainText('تغییرات نسخه');
  for (const t of ['قطعات و انبار', 'پرونده خودرو', 'امکانات مدیریتی', 'گزارش‌ها و چاپ']) await expect(first.getByRole('heading', { name: t }).first()).toBeVisible();
  // Seen once: the announcement does not come back on the next page.
  await page.goto('/accidents/expert');
  await expect(page.getByTestId('version-chip')).toBeVisible();
  await expect(page.getByTestId('release-notice')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('release-chip-390.png') });
  // The inspection checklist is a real PDF.
  const pdf = await page.request.get('/api/v1/print/inspection.pdf');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
});
