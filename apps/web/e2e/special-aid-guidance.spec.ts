import { test, expect, type APIRequestContext } from '@playwright/test';
import { formatJalaliDateInput, formatJalaliDay, formatTimeInput, parseJalali } from '@manage/shared';
import { login } from './helpers';
test.use({ actionTimeout: 15000 });

// Owner instructions of 2026-11-17, synthetic data only (TESTVIN…, invented numbers).
const headers = { 'x-manage-client': 'e2e' };
const FIELDS = ['شماره کارت پذيرش', 'شماره شاسی', 'شماره امداد ویژه', 'کد اختصاصی اولیه', 'کد قطعه', 'كد تداركاتي كالا', 'وضعیت امداد ویژه', 'تاريخ رسيد شدن امداد ويژه در انبار', 'تعداد تداركاتي'];

async function publish(api: APIRequestContext, rows: string[][], minutesAgo: number) {
  const row = (cells: string[]) => `<Row>${cells.map((v) => `<Cell><Data ss:Type="String">${v}</Data></Cell>`).join('')}</Row>`;
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="ساختگی"><Table>${row(FIELDS)}${rows.map(row).join('')}</Table></Worksheet></Workbook>`;
  const uploaded = await api.post('/api/v1/daily-reports/uploads?kind=emdad&fileName=synthetic.xml', { headers: { ...headers, 'content-type': 'application/octet-stream' }, data: Buffer.from(xml) });
  expect(uploaded.status()).toBe(201);
  let job = await uploaded.json();
  await expect.poll(async () => { job = await (await api.get(`/api/v1/daily-reports/imports/${job.id}`)).json(); return job.status; }).not.toMatch(/uploaded|parsing/);
  const at = new Date(Date.now() - minutesAgo * 60000);
  const applied = await api.post(`/api/v1/daily-reports/imports/${job.id}/apply`, { headers, data: { declaration: true, declaredToday: true, acceptTemplate: true, reportDate: formatJalaliDateInput(at), reportTime: formatTimeInput(at) } });
  expect(applied.status(), await applied.text()).toBe(201);
}

test('part row: current special-aid stage before arrival, newer stage after import, arrival with only the warehouse receipt date', async ({ page, browser }) => {
  test.setTimeout(150000);
  await login(page, 'expert');
  const vin = 'TESTVIN99900E2E31';
  const created = await page.request.post('/api/v1/cases', { headers, data: { vehicle: { model: 'خودرو امداد ساختگی', vin }, coverageType: 'golden_card', admittedAt: new Date().toISOString(), admissionNo: '9931' } });
  expect(created.status()).toBe(201);
  const c = await created.json();
  const add = async (partNumber: string, description: string) => {
    const r = await page.request.post(`/api/v1/cases/${c.id}/parts`, { headers, data: { description, partNumber, quantity: 1, source: 'company' } });
    expect(r.status()).toBe(201);
    return r.json();
  };
  const withDate = await add('00123456', 'گلگیر امداد ساختگی');
  const withoutDate = await add('00654321', 'چراغ امداد ساختگی');
  const ctx = await browser.newContext();
  const parts = await ctx.newPage();
  await login(parts, 'parts');
  for (const p of [withDate, withoutDate]) expect((await parts.request.post(`/api/v1/parts/${p.id}/flow`, { headers, data: { expectedVersion: p.version, action: 'emdad' } })).status()).toBe(201);
  const line = (code: string, no: string, status: string, received = '', full = `${code}02`) => ['9931', vin, no, code, code, full, status, received, '1'];

  const row = (name: string) => page.getByTestId('part').filter({ hasText: name });
  await publish(parts.request, [line('00123456', '0070031', 'در مرحلهٔ خرید'), line('00654321', '0070032', 'در مرحلهٔ خرید')], 60);
  await page.goto(`/cases/${c.id}#case-parts`);
  await expect(row('گلگیر امداد ساختگی').getByTestId('emdad-stage')).toHaveText('در مرحلهٔ خرید');

  // A newer pre-arrival stage replaces the shown stage.
  await publish(parts.request, [line('00123456', '0070031', 'در حال جمع آوری'), line('00654321', '0070032', 'در حال جمع آوری')], 40);
  await page.reload();
  await expect(row('گلگیر امداد ساختگی').getByTestId('emdad-stage')).toHaveText('در حال جمع آوری');

  // Arrival: the receipt date (1405/08/20) differs from the report date (today); only the receipt date is shown.
  await publish(parts.request, [line('00123456', '0070031', 'وارد موجودی شده است', '1405/08/20'), line('00654321', '0070032', 'رسید توسط نمایندگی', '')], 20);
  await page.reload();
  const receipt = formatJalaliDay(parseJalali('1405/08/20')!);
  const reportDay = formatJalaliDay(new Date(Date.now() - 20 * 60000));
  expect(receipt).not.toBe(reportDay);
  const stage = row('گلگیر امداد ساختگی').getByTestId('emdad-stage');
  await expect(stage.locator('b')).toHaveText('امداد ویژه رسیده');
  await expect(stage.getByTestId('emdad-received')).toHaveText(receipt);
  await expect(row('گلگیر امداد ساختگی').locator('.ledger-row')).not.toContainText(reportDay);
  // The full 10-digit procurement code read from the report is on the row.
  await expect(row('گلگیر امداد ساختگی').getByTestId('part-code')).toContainText('۰۰۱۲۳۴۵۶۰۲');
  // Arrival without a receipt date: status only, no date; the number shown is «شمارهٔ امداد ویژه» from the report.
  const other = row('چراغ امداد ساختگی');
  await expect(other.getByTestId('emdad-stage').locator('b')).toHaveText('امداد ویژه رسیده');
  await expect(other.getByTestId('emdad-received')).toHaveCount(0);
  await other.locator('.ledger-row').click();
  await expect(other.locator('dt', { hasText: 'شمارهٔ امداد ویژه' })).toBeVisible();
  await expect(other.getByTestId('emdad-no')).toHaveText('۰۰۷۰۰۳۲');
  await expect(page.getByTestId('parts-ledger')).not.toContainText('شمارهٔ درخواست');
  await ctx.close();
});

test('missing repair route: Persian dialog for the expert (with the fix) and the technician (with the role), then the original start succeeds', async ({ page, browser }) => {
  test.setTimeout(150000);
  await login(page, 'expert');
  const created = await page.request.post('/api/v1/cases', { headers, data: { vehicle: { model: 'خودرو مسیر ساختگی', vin: 'TESTVIN99900E2E32' }, customer: { fullName: 'مشتری ساختگی مسیر', phone: '09000000932' }, coverageType: 'personal', admittedAt: new Date().toISOString(), damageDescription: 'نقاشی؛ ساختگی' } });
  expect(created.status()).toBe(201);
  const c = await created.json();
  const departments = await (await page.request.get('/api/v1/departments')).json() as { id: string; code: string }[];
  const paint = departments.find((d) => d.code === 'paint') ?? departments[0]!;
  let a = await (await page.request.post(`/api/v1/cases/${c.id}/assessments`, { headers, data: { kind: 'initial', assessorName: 'کارشناس ساختگی' } })).json();
  a = await (await page.request.post(`/api/v1/assessments/${a.id}/items`, { headers, data: { expectedVersion: a.version, action: 'repair', description: 'اجرت ساختگی', labourDepartmentId: paint.id, labourRial: 1000000 } })).json();
  a = await (await page.request.post(`/api/v1/assessments/${a.id}/finalize`, { headers, data: { expectedVersion: a.version } })).json();
  await page.request.post(`/api/v1/assessments/${a.id}/authorization`, { headers, data: { expectedVersion: a.version, decision: 'approved', source: 'customer', method: 'in_person' } });
  const staff = await (await page.request.get('/api/v1/workshop/staff')).json() as { id: string; displayName: string }[];
  const tech = staff.find((s) => s.displayName === 'تکنسین نمونه')!;
  // A job card without station or duration: the route of this vehicle is not configured.
  const task = await (await page.request.post(`/api/v1/cases/${c.id}/tasks`, { headers, data: { departmentId: paint.id, assignedUserId: tech.id, title: 'نقاشی بدون مسیر ساختگی' } })).json();

  // Authorized: the expert's start shows the blocker and the button to the plan of the same case.
  await page.goto(`/cases/${c.id}#case-tasks`);
  const start = page.getByTestId('task').filter({ hasText: 'نقاشی بدون مسیر ساختگی' }).getByRole('button', { name: 'شروع', exact: true });
  await start.click();
  const dialog = page.getByRole('dialog', { name: 'شروع کار هنوز ممکن نیست' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('workflow-blockers')).toContainText('برای شروع کار، مسیر تعمیر این خودرو باید مشخص شود');
  await expect(dialog.getByRole('link', { name: 'تنظیم مسیر تعمیر' })).toHaveAttribute('href', `/cases/${c.id}#case-plan`);
  // Keyboard: Esc closes and focus returns to the original button.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(start).toBeFocused();

  // Unauthorized: the technician sees the reason and the role that can resolve it, no fix button.
  const ctx = await browser.newContext();
  const techPage = await ctx.newPage();
  await login(techPage, 'technician');
  await techPage.goto('/workshop/technician');
  // Other suites may have given this technician work: find this assignment (current card or next list).
  const mineCard = techPage.locator('article, li').filter({ hasText: 'نقاشی بدون مسیر ساختگی' }).last();
  await expect(mineCard).toContainText('برای شروع کار، مسیر تعمیر این خودرو باید مشخص شود');
  if (await mineCard.getByRole('button', { name: 'شروع کار' }).count()) await expect(mineCard.getByRole('button', { name: 'شروع کار' })).toBeDisabled();
  await mineCard.getByRole('button', { name: 'چرا و چه باید کرد؟' }).click();
  const techDialog = techPage.getByRole('dialog', { name: 'شروع کار هنوز ممکن نیست' });
  await expect(techDialog).toContainText('برای شروع کار، مسیر تعمیر این خودرو باید مشخص شود');
  await expect(techDialog).toContainText('چه کسی می‌تواند برطرف کند');
  await expect(techDialog).toContainText('کارشناس تصادفات');
  await expect(techDialog.getByRole('link', { name: 'تنظیم مسیر تعمیر' })).toHaveCount(0);

  // The expert follows the fix: sets the route and confirms the plan of the same case.
  await start.click();
  await dialog.getByRole('link', { name: 'تنظیم مسیر تعمیر' }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${c.id}#case-plan$`));
  const stations = await (await page.request.get('/api/v1/workshop/stations')).json() as { id: string; departmentId: string }[];
  let station = stations.find((s) => s.departmentId === paint.id);
  if (!station) {
    const admin = await browser.newContext(); const adminPage = await admin.newPage(); await login(adminPage, 'admin');
    station = (await (await adminPage.request.post('/api/v1/workshop/stations', { headers, data: { code: 'E2E-P32', name: 'نقاشی ساختگی', trade: 'paint', departmentId: paint.id, responsibleUserId: null } })).json() as { id: string; code: string }[]).find((s) => s.code === 'E2E-P32')!;
    await admin.close();
  }
  const fixed = await page.request.patch(`/api/v1/tasks/${task.id}`, { headers, data: { expectedVersion: task.version, stationId: station!.id, durationDays: 1, scheduleReason: 'تنظیم مسیر ساختگی' } });
  expect(fixed.status(), await fixed.text()).toBe(200);
  const kase = await (await page.request.get(`/api/v1/cases/${c.id}`)).json();
  expect((await page.request.post(`/api/v1/cases/${c.id}/workflow`, { headers, data: { action: 'confirm_plan', expectedVersion: kase.version } })).status()).toBe(201);

  // Retry the original action from the technician's dialog: it now succeeds.
  await techDialog.getByRole('button', { name: 'تلاش دوباره' }).click();
  await expect(techPage.getByRole('status').filter({ hasText: 'شروع کار ثبت شد.' })).toBeVisible();
  const after = await (await techPage.request.get('/api/v1/workshop/my-tasks')).json() as { id: string; status: string; startSource: string | null }[];
  const started = after.find((t) => t.id === task.id) as { id: string; status: string; startSource: string | null; version: number } | undefined;
  expect(started).toMatchObject({ status: 'in_progress', startSource: 'recorded' });
  // Leave the shared seed technician without active work for the suites that follow.
  expect((await techPage.request.post(`/api/v1/workshop/my-tasks/${task.id}/actions`, { headers, data: { action: 'complete', expectedVersion: started!.version } })).status()).toBe(201);
  await ctx.close();
});
