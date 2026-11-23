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
  await picker.getByLabel('تعداد', { exact: true }).fill('2');
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
  // Bordered selected-parts list: name, 8-digit reference, quantity and «افزوده شد»; quantity edit and removal.
  const picked = page.getByTestId('smart-picked');
  await expect(picked.getByTestId('smart-picked-row')).toHaveCount(2);
  await expect(picked.getByTestId('smart-picked-row').first()).toContainText('افزوده شد');
  await expect(picked).toContainText('۰۰۹۹۸۸۱۱');
  const qty = picked.getByRole('spinbutton', { name: /تعداد سپر جلو/ });
  await qty.fill('3');
  await qty.press('Enter');
  await expect(picked.getByRole('spinbutton', { name: /تعداد سپر جلو/ })).toHaveValue('3');
  await picked.getByRole('button', { name: /حذف دیاق/ }).click();
  await expect(picked.getByTestId('smart-picked-row')).toHaveCount(1);
  const labour = panel.getByTestId('optional-labour');
  await labour.locator(':scope > summary').click();
  const department = labour.locator('details').first();
  await department.locator('summary').click();
  await department.getByRole('button', { name: 'ثبت اجرت واحد' }).click();
  await expect(panel.getByTestId('assessment-item')).toHaveCount(2);
  await department.getByLabel('مبلغ اجرت', { exact: false }).fill('۲۰۰۰۰');
  await department.getByRole('button', { name: 'ثبت اجرت واحد' }).click();
  await expect(panel.getByTestId('assessment-total')).toContainText('۲۰,۰۰۰');
  await expect(picked.getByTestId('smart-picked-row')).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await expect(labour).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.screenshot({ path: test.info().outputPath('smart-picked.png'), fullPage: false });
});

test('smart assessment: «سورن ELX» shows the Soren family parts with a trim check and keeps quick entry', async ({ page }) => {
  await login(page, 'admin');
  const headers = { 'x-manage-client': 'e2e' };
  const sheet = Buffer.from(writeSheet('قطعات', [
    ['کد فنی', 'نام قطعه', 'مصرف خودرو'],
    ['0077331101', 'چراغ جلو خانواده آزمون', 'سورن پلاس'],
    ['0077331201', 'چراغ جلو خانواده آزمون دیگر', 'تارا'],
  ])).toString('base64');
  const imp = await (await page.request.post('/api/v1/reference-imports', { headers, data: { kind: 'parts', fileName: 'synthetic-family.xlsx', fileBase64: sheet, sheetIndex: 0, headerRow: 1, mapping: { partNumber: 0, description: 1, vehicleUse: 2 } } })).json() as { id: string };
  expect((await page.request.post(`/api/v1/reference-imports/${imp.id}/apply`, { headers, data: {} })).status()).toBe(201);
  const created = await page.request.post('/api/v1/cases', { headers, data: { admittedAt: new Date(Date.now() - 86_400_000).toISOString(), vehicle: { model: 'سورن ELX' }, coverageType: 'insurance' } });
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/cases/${id}`);
  await openCaseTab(page, 'کارشناسی');
  const panel = page.getByTestId('assessment-panel');
  await panel.getByRole('button', { name: 'ایجاد کارشناسی دستی هوشمند' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام کارشناس *').fill('کارشناس نمونه');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  const picker = panel.getByTestId('smart-assessment-entry');
  const search = picker.getByRole('combobox', { name: 'جست‌وجوی قطعه' });
  await search.fill('چراغ جلو خانواده');
  await expect(picker.getByRole('option')).toHaveCount(1);
  const family = picker.getByTestId('smart-family');
  await expect(family).toContainText('خودروی پرونده:سورن ELX');
  await expect(family).toContainText('خانوادهٔ شناسایی‌شده:سورن');
  await expect(family).toContainText('قطعات مرتبط با خانوادهٔ سورن');
  await expect(picker.getByTestId('smart-fit-note')).toHaveText('نیازمند بررسی تطابق با تیپ خودرو');
  await search.press('Enter');
  await expect(panel.getByTestId('assessment-item')).toHaveCount(1);
  await expect(page.getByTestId('smart-picked')).toContainText('۰۰۷۷۳۳۱۱');
});

test('smart assessment: a vehicle that cannot be matched to a catalog family gets no suggestions', async ({ page }) => {
  await login(page, 'admin');
  const headers = { 'x-manage-client': 'e2e' };
  const created = await page.request.post('/api/v1/cases', { headers, data: { admittedAt: new Date(Date.now() - 86_400_000).toISOString(), vehicle: { model: 'خودروی ناشناخته آزمون' }, coverageType: 'insurance' } });
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/cases/${id}`);
  await openCaseTab(page, 'کارشناسی');
  const panel = page.getByTestId('assessment-panel');
  await panel.getByRole('button', { name: 'ایجاد کارشناسی دستی هوشمند' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام کارشناس *').fill('کارشناس نمونه');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  const picker = panel.getByTestId('smart-assessment-entry');
  await picker.getByRole('combobox', { name: 'جست‌وجوی قطعه' }).fill('سپر');
  await expect(picker.getByTestId('smart-fitment-unverified')).toContainText('قابل تشخیص نیست');
  await expect(picker.getByRole('option')).toHaveCount(0);
});

test('smart assessment: three vehicle scopes — Samand catalog for a «سورن ELX» case, all vehicles, and back', async ({ page }) => {
  await login(page, 'admin');
  const headers = { 'x-manage-client': 'e2e' };
  const sheet = Buffer.from(writeSheet('قطعات', [
    ['کد فنی', 'نام قطعه', 'مصرف خودرو'],
    ['0077441101', 'آینه بغل دامنه آزمون', 'سورن پلاس'],
    ['0077441201', 'آینه بغل دامنه آزمون سمند', 'سمند'],
    ['0077441301', 'آینه بغل دامنه آزمون پارس', 'پژو پارس'],
  ])).toString('base64');
  const imp = await (await page.request.post('/api/v1/reference-imports', { headers, data: { kind: 'parts', fileName: 'synthetic-scope.xlsx', fileBase64: sheet, sheetIndex: 0, headerRow: 1, mapping: { partNumber: 0, description: 1, vehicleUse: 2 } } })).json() as { id: string };
  expect((await page.request.post(`/api/v1/reference-imports/${imp.id}/apply`, { headers, data: {} })).status()).toBe(201);
  const created = await page.request.post('/api/v1/cases', { headers, data: { admittedAt: new Date(Date.now() - 86_400_000).toISOString(), vehicle: { model: 'سورن ELX' }, coverageType: 'insurance' } });
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/cases/${id}`);
  await openCaseTab(page, 'کارشناسی');
  const panel = page.getByTestId('assessment-panel');
  await panel.getByRole('button', { name: 'ایجاد کارشناسی دستی هوشمند' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام کارشناس *').fill('کارشناس نمونه');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  const picker = panel.getByTestId('smart-assessment-entry');
  const scopes = picker.getByRole('group', { name: 'دامنهٔ جست‌وجوی خودرو' });
  await expect(scopes.getByRole('button', { name: 'خودروی پرونده' })).toHaveAttribute('aria-pressed', 'true');
  const search = picker.getByRole('combobox', { name: 'جست‌وجوی قطعه' });
  await search.fill('آینه بغل دامنه');
  // Default: only the Soren family.
  await expect(picker.getByRole('listbox', { name: 'قطعات پیشنهادی' }).getByRole('option')).toHaveCount(1);
  await expect(picker.getByRole('listbox', { name: 'قطعات پیشنهادی' }).getByRole('option')).toContainText('سورن');

  // Another vehicle: the Samand catalog, with the unverified-compatibility warning.
  await scopes.getByRole('button', { name: 'انتخاب خودرو' }).click();
  await picker.getByLabel('جست‌وجوی خودرو', { exact: true }).fill('سمند');
  const select = picker.getByTestId('smart-vehicle-select');
  await expect(select.locator('option')).toHaveCount(2);
  await select.selectOption({ index: 1 });
  await expect(picker.getByTestId('smart-scope-text')).toContainText('کاتالوگ سمند');
  await expect(picker.getByTestId('smart-cross-warning')).toBeVisible();
  await expect(picker.getByRole('listbox', { name: 'قطعات پیشنهادی' }).getByRole('option')).toHaveCount(1);
  await expect(picker.getByTestId('smart-source')).toContainText('سمند');
  await expect(picker.getByTestId('smart-fit-note')).toContainText('سازگاری با خودروی پرونده تأیید نشده');
  await picker.screenshot({ path: test.info().outputPath('smart-scope.png') });
  await search.press('Enter');
  await expect(panel.getByTestId('assessment-item')).toHaveCount(1);
  await expect(page.getByTestId('smart-picked-note')).toContainText('منبع کاتالوگ: سمند');

  // All vehicles, then back to the case vehicle; the case model is unchanged.
  await scopes.getByRole('button', { name: 'همه خودروها' }).click();
  await search.fill('آینه بغل دامنه');
  await expect(picker.getByRole('listbox', { name: 'قطعات پیشنهادی' }).getByRole('option')).toHaveCount(3);
  await scopes.getByRole('button', { name: 'خودروی پرونده' }).click();
  await search.fill('آینه بغل دامنه آزمون');
  await expect(picker.getByRole('listbox', { name: 'قطعات پیشنهادی' }).getByRole('option')).toHaveCount(1);
  await expect(picker.getByTestId('smart-family')).toContainText('خودروی پرونده:سورن ELX');
  const kase = await (await page.request.get(`/api/v1/cases/${id}`, { headers })).json() as { vehicle: { model: string } };
  expect(kase.vehicle.model).toBe('سورن ELX');
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
