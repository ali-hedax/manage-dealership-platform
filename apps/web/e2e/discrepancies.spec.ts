import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Parts discrepancy queue in the parts report: a part is handed over but the
// unit still reports it missing; the parts clerk takes the review, records the
// outcome with a reason, and the history shows each step.
test('parts clerk reviews a handover-vs-shortage discrepancy and records the outcome with a reason', async ({ page }, testInfo) => {
  await login(page, 'admin');
  const api = (path: string, data?: object) =>
    data
      ? page.request.post(`/api/v1${path}`, { data, headers: { 'x-manage-client': 'web' } })
      : page.request.get(`/api/v1${path}`, { headers: { 'x-manage-client': 'web' } });
  const depts = await (await api('/departments')).json();
  const kase = await (await api('/cases', { vehicle: { model: 'رانا', vin: `TESTVIN${Date.now().toString().slice(-10)}` }, admittedAt: new Date(Date.now() - 86_400_000).toISOString(), coverageType: 'personal' })).json();
  let part = await (await api(`/cases/${kase.id}/parts`, { description: 'آینه بغل آزمون', source: 'stock' })).json();
  for (const [action, extra] of [
    ['check_stock', { inStock: true }],
    ['reserve', {}],
    ['hand_over', { departmentId: depts[0].id, recipientName: 'تکنسین آزمون' }],
  ] as const) {
    part = await (await api(`/parts/${part.id}/actions`, { action, expectedVersion: part.version, ...extra })).json();
  }
  expect((await api(`/cases/${kase.id}/blockers`, { reason: 'part_not_arrived', description: 'واحد: آینه نرسیده' })).ok()).toBe(true);

  await page.goto('about:blank');
  await page.context().clearCookies();
  await login(page, 'parts');
  await page.goto('/reports?view=parts');
  const queue = page.getByTestId('discrepancy-queue');
  const item = queue.getByTestId('discrepancy').filter({ hasText: kase.caseNumber });
  await expect(item).toContainText('تحویل ثبت‌شده، اما واحد تعمیر کمبود اعلام کرده');
  await expect(item).toContainText('آینه بغل آزمون');
  await expect(page.getByTestId('work-row').filter({ hasText: 'مغایرت قطعه' }).first()).toBeVisible();
  await queue.screenshot({ path: testInfo.outputPath('discrepancy-queue.png') });

  await item.getByRole('button', { name: 'بررسی با من' }).click();
  await expect(item).toContainText('در حال بررسی');
  await item.getByRole('button', { name: 'ثبت نتیجه بررسی' }).click();
  const dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', { name: 'ثبت', exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('دلیل و آنچه بررسی شد *').fill('آینه در قفسه واحد پیدا شد؛ مانع با واحد هماهنگ و رفع می‌شود');
  await submit.click();
  await expect(item).toHaveCount(0);

  await queue.getByRole('button', { name: 'رفع‌شده' }).click();
  const done = queue.getByTestId('discrepancy').filter({ hasText: kase.caseNumber });
  await expect(done).toContainText('آینه در قفسه واحد پیدا شد');
  await done.getByRole('button', { name: 'سابقه رسیدگی' }).click();
  await expect(done).toContainText('شناسایی خودکار');
  await expect(done).toContainText('رفع مغایرت قطعه');
});
