import { expect, test } from '@playwright/test';
import { writeSheet } from '../../api/src/parts/xlsx';
import { login, openCaseTab } from './helpers';

// Intelligent manual «افزودن قطعه» (owner, 2026-11-25): three parts in a row on an existing Rira
// case without leaving the case or reopening the form. Synthetic catalog and invented codes only.
test('manual add part: search, pick, add and continue for several parts; the same part raises its quantity', async ({ page }) => {
  await login(page, 'admin');
  const headers = { 'x-manage-client': 'e2e' };
  const sheet = Buffer.from(writeSheet('قطعات', [
    ['کد فنی', 'نام قطعه', 'مصرف خودرو'],
    ['4410010101', 'سپر جلو ری را آزمون دستی', 'ری را'],
    ['4410020101', 'چراغ جلو راست ری را آزمون دستی', 'ری را'],
    ['4410020201', 'چراغ جلو چپ ری را آزمون دستی', 'ری را'],
    ['4410030101', 'گلگیر جلو ری را آزمون دستی', 'ری را'],
  ])).toString('base64');
  const imported = await page.request.post('/api/v1/reference-imports', {
    headers, data: { kind: 'parts', fileName: 'synthetic-manual-picker.xlsx', fileBase64: sheet, sheetIndex: 0, headerRow: 1, mapping: { partNumber: 0, description: 1, vehicleUse: 2 } },
  });
  expect(imported.status()).toBe(201);
  expect((await page.request.post(`/api/v1/reference-imports/${(await imported.json()).id}/apply`, { headers, data: {} })).status()).toBe(201);
  const created = await page.request.post('/api/v1/cases', {
    headers, data: { admittedAt: new Date(Date.now() - 86_400_000).toISOString(), vehicle: { brand: 'ایران خودرو', model: 'ری را' }, coverageType: 'insurance' },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  await page.goto(`/cases/${id}`);
  await openCaseTab(page, 'قطعات');
  const ledger = page.getByTestId('parts-ledger');
  await ledger.getByRole('button', { name: 'افزودن قطعه', exact: true }).click();
  const entry = ledger.getByTestId('smart-part-entry');
  const search = entry.getByTestId('smart-part-search');
  await expect(search).toBeFocused();

  // 1) «سپر»: compatible result with its code; Enter picks the highlighted row, Enter on quantity adds.
  await search.fill('سپر');
  const option = entry.getByTestId('smart-part-option');
  await expect(option).toHaveCount(1);
  await expect(option.first()).toContainText('سازگار با خودروی پرونده');
  await expect(option.first()).toContainText('۴۴۱۰۰۱۰۱');
  await expect(entry.getByTestId('smart-part-vehicle')).toContainText('ری را');
  await search.press('Enter');
  const preview = entry.getByTestId('smart-part-preview');
  await expect(preview).toContainText('کد تدارکاتی');
  await expect(preview).toContainText('4410010101');
  await expect(entry.getByTestId('smart-part-qty')).toBeFocused();
  await entry.getByTestId('smart-part-qty').press('Enter');
  await expect(ledger.getByTestId('part')).toHaveCount(1);
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();

  // 2) «چراغ جلو»: two results; the second chosen with the arrow keys, quantity 2.
  await search.fill('چراغ جلو');
  await expect(option).toHaveCount(2);
  await search.press('ArrowDown');
  await search.press('Enter');
  await entry.getByTestId('smart-part-qty').fill('2');
  await entry.getByTestId('smart-part-add').click();
  await expect(ledger.getByTestId('part')).toHaveCount(2);

  // 3) a third part by mouse.
  await search.fill('گلگیر');
  await option.first().click();
  await entry.getByRole('button', { name: 'افزودن و ادامه' }).click();
  await expect(ledger.getByTestId('part')).toHaveCount(3);
  await expect(entry.getByTestId('smart-part-recent').getByRole('listitem')).toHaveCount(3);

  // The same part again: no duplicate line, its quantity is raised (existing rule of the parts list).
  await search.fill('سپر');
  await expect(option.first()).toContainText('در فهرست');
  await search.press('Enter');
  await expect(entry.getByRole('button', { name: 'افزایش تعداد و ادامه' })).toBeVisible();
  await entry.getByTestId('smart-part-qty').press('Enter');
  await expect(entry.getByTestId('smart-part-recent')).toContainText('تعداد افزایش یافت');
  await expect(ledger.getByTestId('part')).toHaveCount(3);
  const parts = (await (await page.request.get(`/api/v1/cases/${id}/parts`, { headers })).json()) as { partNumber: string; quantity: number; status: string }[];
  expect(parts.find((p) => p.partNumber === '44100101')?.quantity).toBe(2);
  expect(parts.every((p) => p.status === 'needed')).toBe(true);

  // Manual entry remains for a part the catalog does not have.
  await ledger.getByTestId('manual-part-toggle').click();
  await expect(ledger.getByRole('form', { name: 'افزودن قطعه' })).toBeVisible();
  await page.screenshot({ path: 'test-results/smart-part-entry.png', fullPage: false });
});
