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
  await panel.getByRole('button', {name: 'ایجاد کارشناسی دستی هوشمند'}).click();
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

test('parts clerk reviews individual draft lines and returns only a disputed technical code', async ({ page }) => {
  await login(page, 'admin');
  const headers = {'x-manage-client':'e2e'};
  const kase = await page.request.post('/api/v1/cases', {
    headers, data: {
      admittedAt: new Date(Date.now()-86400000).toISOString(),
      vehicle:{model:'ری را'}, coverageType:'insurance',
    },
  });
  expect(kase.status()).toBe(201);
  const {id}=(await kase.json()) as {id:string};
  const created=await page.request.post(`/api/v1/cases/${id}/assessments`, {
    headers, data:{kind:'initial',smartManual:true,assessorName:'کارشناس آزمایشی'},
  });
  expect(created.status()).toBe(201);
  const draft=(await created.json()) as {id:string;version:number};
  const first=await page.request.post(`/api/v1/assessments/${draft.id}/items`, {
    headers,data:{expectedVersion:draft.version,action:'replace',description:'سپر جلو تست',partNumber:'98760001',quantity:1},
  });
  expect(first.status()).toBe(201);
  const version=((await first.json()) as {version:number}).version;
  const second=await page.request.post(`/api/v1/assessments/${draft.id}/items`, {
    headers,data:{expectedVersion:version,action:'replace',description:'دیاق سپر تست',partNumber:'98760002',quantity:1},
  });
  expect(second.status()).toBe(201);
  await login(page,'parts');
  await page.goto(`/cases/${id}#case-assessment`);
  await openCaseTab(page,'کارشناسی');
  const review=page.getByTestId('technical-review-panel');
  await expect(review).toBeVisible();
  await expect(review).toContainText('سپر جلو تست');
  const firstRow=review.locator('.panel').filter({hasText:'سپر جلو تست'});
  await firstRow.getByRole('button',{name:'تأیید فنی'}).click();
  await expect(firstRow).toContainText('تأیید فنی قطعه');
  const secondRow=review.locator('.panel').filter({hasText:'دیاق سپر تست'});
  await secondRow.getByLabel('دلیل اصلاح (هنگام برگشت الزامی)').fill('شماره فنی مناسب نیست');
  await secondRow.getByRole('button',{name:'برگشت برای اصلاح'}).click();
  await expect(secondRow).toContainText('نیازمند اصلاح');
  await page.reload();
  await openCaseTab(page,'کارشناسی');
  const persisted=page.getByTestId('technical-review-panel');
  await expect(persisted).toContainText('شماره فنی مناسب نیست');
  await expect(persisted).toContainText('تأیید فنی قطعه');
});
