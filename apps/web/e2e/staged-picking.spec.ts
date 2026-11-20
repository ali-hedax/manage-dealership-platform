import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('selects parts across vehicles by section and delivers the saved batch separately from printing', async ({ page }) => {
  const headers = { 'x-manage-client': 'e2e' };
  await login(page, 'expert');
  const departments = await (await page.request.get('/api/v1/departments', { headers })).json() as { id: string; code: string; name: string }[];
  const section = departments.find(({ code }) => code === 'body')!;
  const files = [
    { vehicle: 'رانا آزمون برداشت', plate: '21 ب 315 ایران 65', part: 'گلگیر آزمون', code: '01911111' },
    { vehicle: 'دنا آزمون برداشت', plate: '22 ب 315 ایران 65', part: 'چراغ آزمون', code: '01922222' },
  ];
  const draftIds: { id: string; version: number; caseId: string }[] = [];
  for (const file of files) {
    const created = await page.request.post('/api/v1/cases', { headers, data: {
      isLegacyEntry: true, stage: 'assessment', admittedAt: new Date(Date.now() - 86_400_000).toISOString(),
      coverageType: 'personal', vehicle: { model: file.vehicle, plate: file.plate },
    } });
    expect(created.status()).toBe(201);
    const kase = await created.json() as { id: string };
    expect((await page.request.post(`/api/v1/cases/${kase.id}/tasks`, { headers, data: { departmentId: section.id } })).status()).toBe(201);
    const part = await page.request.post(`/api/v1/cases/${kase.id}/parts`, { headers, data: {
      description: file.part, partNumber: file.code, quantity: 1, source: 'company',
    } });
    expect(part.status()).toBe(201);
    draftIds.push(await part.json());
  }
  await page.context().clearCookies();
  await login(page, 'parts');
  for (const part of draftIds) {
    const endpoint = `/api/v1/parts/${part.id}/flow`;
    const ordered = await page.request.post(endpoint, { headers, data: {
      action: 'market', expectedVersion: part.version, purchaseUnitRial: 1000, saleUnitRial: 1500, supplier: 'فروشنده آزمون',
    } });
    expect(ordered.status()).toBe(201);
    const row = await ordered.json() as { version: number };
    expect((await page.request.post(endpoint, { headers, data: { action: 'receive', expectedVersion: row.version } })).status()).toBe(201);
  }
  await page.goto('/accidents/parts');
  await page.getByText('جمع‌آوری و تحویل مرحله‌ای قطعات', { exact: true }).click();
  const panel = page.getByTestId('parts-picking');
  await panel.getByLabel('صافی بخش کاری').selectOption(section.id);
  const search = panel.getByLabel('جست‌وجوی خودرو یا قطعه');
  await search.fill(files[0]!.vehicle);
  await panel.locator('.picking-vehicle > summary').click();
  await panel.getByRole('checkbox', { name: /گلگیر آزمون/ }).check();
  await search.fill(files[1]!.vehicle);
  await panel.getByRole('button', { name: 'انتخاب همهٔ اقلام نمایش‌داده‌شده' }).click();
  await expect(panel.getByText('۲ قلم انتخاب شده · ۲ خودرو')).toBeVisible();
  await panel.getByRole('button', { name: 'ثبت نوبت جمع‌آوری' }).click();
  const batch = panel.getByTestId('picking-batch');
  const pdfUrl = await batch.getByRole('link', { name: 'باز کردن PDF نوبت' }).getAttribute('href');
  const pdf = await page.request.get(pdfUrl!);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  for (const part of draftIds) {
    const rows = await (await page.request.get(`/api/v1/cases/${part.caseId}/parts`)).json() as { id: string; status: string }[];
    expect(rows.find(({ id }) => id === part.id)?.status).toBe('received');
  }
  await batch.getByRole('button', { name: 'ثبت تحویل نوبت' }).click();
  await batch.getByLabel('نام تحویل‌گیرنده').fill('صافکار آزمون');
  await batch.getByRole('button', { name: 'تأیید تحویل همهٔ اقلام این نوبت' }).click();
  await expect(batch).toHaveCount(0);
  await panel.getByText('تاریخچهٔ نوبت‌ها', { exact: true }).click();
  await expect(panel.getByTestId('picking-batch')).toContainText('تحویل به صافکار آزمون');
});
