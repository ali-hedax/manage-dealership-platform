import { expect, test } from '@playwright/test';
import { writeSheet } from '../../api/src/parts/xlsx';
import { login, openCaseTab } from './helpers';

test('smart assessment: rapid catalog selection persists two lines and prevents duplicate quick entry', async ({ page }) => {
  await login(page, 'admin');
  const headers = { 'x-manage-client': 'e2e' };
  const codeA = '00998811', codeB = '00998812';
  const sheet = Buffer.from(writeSheet('قطعات', [
    ['کد فنی', 'نام قطعه', 'مصرف خودرو'],
    [codeA, 'سپر جلو ری را آزمون', 'ری را'],
    [codeB, 'دیاق سپر جلو ری را آزمون', 'ری را'],
  ])).toString('base64');
  const imported = await page.request.post('/api/v1/reference-imports', {
    headers, data: {
      kind: 'parts', fileName: 'synthetic-smart-picker.xlsx', fileBase64: sheet,
      sheetIndex: 0, headerRow: 1,
      mapping: { partNumber: 0, description: 1, vehicleUse: 2 },
    },
  });
  expect(imported.status()).toBe(201);
  const imp = (await imported.json()) as { id: string };
  const applied = await page.request.post(`/api/v1/reference-imports/${imp.id}/apply`, { headers, data: {} });
  expect(applied.status()).toBe(201);

  const created = await page.request.post('/api/v1/cases', {
    headers,
    data: {
      admittedAt: new Date(Date.now() - 86_400_000).toISOString(),
      vehicle: { brand: 'ایران خودرو', model: 'ری را' },
      coverageType: 'insurance',
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/cases/${id}`);
  await openCaseTab(page, 'کارشناسی');
  const panel = page.getByTestId('assessment-panel');
  await panel.getByRole('button', {name: 'شروع کارشناسی'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام کارشناس *').fill('کارشناس نمونه');
  await dialog.getByRole('button', {name: 'ثبت', exact: true}).click();

  const picker = panel.getByTestId('smart-assessment-entry');
  await expect(picker).toBeVisible();
  const search = picker.getByRole('combobox', { name: 'جست‌وجوی قطعه' });
  await search.fill('سپر');
  await expect(picker.getByRole('option')).toHaveCount(2);
  await search.press('Enter');
  await expect(search).toHaveValue('');
  await expect(panel.getByTestId('assessment-item')).toHaveCount(1);

  await search.fill(codeB);
  await expect(picker.getByRole('option')).toHaveCount(1);
  await picker.getByLabel('تعداد').fill('2');
  await search.press('Enter');
  await expect(search).toHaveValue('');
  await expect(panel.getByTestId('assessment-item')).toHaveCount(2);

  await search.fill(codeA);
  await expect(picker.getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(panel.getByTestId('assessment-item')).toHaveCount(2);
  await page.reload();
  await openCaseTab(page, 'کارشناسی');
  await expect(page.getByTestId('assessment-item')).toHaveCount(2);
  await expect(page.getByTestId('assessment-panel')).toContainText(codeB);
});
