import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Owner, 2026-11-19: «لغو مرحله» from the case's stage menu with a reason; the stage leaves the
// active plan and appears under «مراحل لغوشده» with «فعال‌سازی مجدد». Synthetic data only.
test('cancel a not-started painting stage with a reason, then reactivate it', async ({ page }, info) => {
  await login(page, 'expert');
  const headers = { 'x-manage-client': 'e2e' };
  const created = await page.request.post('/api/v1/cases', { headers, data: { isLegacyEntry: true, stage: 'assessment', admittedAt: new Date(Date.now() - 86_400_000).toISOString(), vehicle: { brand: 'ایران خودرو', model: 'رانا پلاس', trim: 'تیپ TU5 رانا پلاس تیپ TU5', plate: '۲۳ ب ۴۵۶ - ۱۶' }, coverageType: 'personal' } });
  const { id } = (await created.json()) as { id: string };
  const depts = (await (await page.request.get('/api/v1/departments', { headers })).json()) as { id: string; code: string }[];
  const body = depts.find((d) => d.code === 'body')!.id, paint = depts.find((d) => d.code === 'paint')!.id;
  expect((await page.request.post(`/api/v1/cases/${id}/tasks`, { headers, data: { departmentId: body, technicianName: 'الف' } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/cases/${id}/tasks`, { headers, data: { departmentId: paint, technicianName: 'ب' } })).status()).toBe(201);
  await page.goto(`/cases/${id}#case-tasks`);
  const tasks = page.getByTestId('task');
  await expect(tasks).toHaveCount(2);
  // The vehicle name appears once (no trim), full specs are one click away.
  await expect(page.locator('.cf2-folder h1')).toHaveText('رانا پلاس');
  await expect(page.getByTestId('vehicle-tech-details')).not.toHaveAttribute('open', '');
  const paintRow = tasks.filter({ hasText: 'نقاشی' });
  await paintRow.locator('summary', { hasText: '⋯' }).click();
  await paintRow.getByRole('button', { name: 'لغو مرحله' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('علت لغو *').selectOption('customer_withdrew');
  await dialog.getByLabel(/توضیح/).fill('مشتری از نقاشی انصراف داد');
  await page.screenshot({ path: info.outputPath('cancel-dialog.png') });
  await dialog.getByRole('button', { name: 'لغو مرحله' }).click();
  await expect(page.getByTestId('task')).toHaveCount(1);
  await expect(page.getByTestId('task')).toContainText('صافکاری');
  const history = page.getByTestId('cancelled-stages');
  await history.locator('summary').click();
  await expect(history.getByTestId('cancelled-stage')).toContainText('انصراف مشتری');
  await page.screenshot({ path: info.outputPath('cancelled-history.png'), fullPage: true });
  await history.getByRole('button', { name: 'فعال‌سازی مجدد' }).click();
  await expect(page.getByTestId('task')).toHaveCount(2);
});
