import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { formatJalaliDateInput, formatTimeInput } from '@manage/shared';
import { login } from './helpers';
test.use({ actionTimeout: 15000 });

// «پیگیری امداد ویژه» (PR #119) through the real browser: the four workspaces render with the
// existing design system, and screenshots of the new screens are saved beside existing pages
// (uploaded by CI as the «special-aid-screenshots» artifact). Synthetic data only.
const headers = { 'x-manage-client': 'e2e' };
const FIELDS = ['شماره کارت پذيرش', 'شماره شاسی', 'شماره امداد ویژه', 'کد اختصاصی اولیه', 'کد قطعه', 'وضعیت امداد ویژه', 'تاريخ رسيد شدن امداد ويژه در انبار', 'تعداد اختصاصي', 'شرح قطعه اختصاصي'];
const VIN = 'TESTVIN99900E2E71';
const SHOTS = 'test-results/special-aid-screenshots';

async function publish(api: APIRequestContext, rows: string[][]) {
  const row = (cells: string[]) => `<Row>${cells.map((v) => `<Cell><Data ss:Type="String">${v}</Data></Cell>`).join('')}</Row>`;
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="ساختگی"><Table>${row(FIELDS)}${rows.map(row).join('')}</Table></Worksheet></Workbook>`;
  const uploaded = await api.post('/api/v1/daily-reports/uploads?kind=emdad&fileName=synthetic.xml', { headers: { ...headers, 'content-type': 'application/octet-stream' }, data: Buffer.from(xml) });
  expect(uploaded.status()).toBe(201);
  let job = await uploaded.json();
  await expect.poll(async () => { job = await (await api.get(`/api/v1/daily-reports/imports/${job.id}`)).json(); return job.status; }).not.toMatch(/uploaded|parsing/);
  const at = new Date(Date.now() - 5 * 60000);
  const applied = await api.post(`/api/v1/daily-reports/imports/${job.id}/apply`, { headers, data: { declaration: true, declaredToday: true, acceptTemplate: true, reportDate: formatJalaliDateInput(at), reportTime: formatTimeInput(at) } });
  expect(applied.status(), await applied.text()).toBe(201);
}

/** Design tokens that must be identical to the existing pages (no new palette, type or card style). */
async function tokens(page: Page) {
  return page.evaluate(() => {
    const css = (sel: string, prop: string) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).getPropertyValue(prop) : null; };
    return { font: css('body', 'font-family'), bg: css('body', 'background-color'), text: css('body', 'color'), primary: css('.btn-primary', 'background-color'), sidebar: css('nav[aria-label]', 'font-family') };
  });
}

test('special-aid workspaces use the existing design system; screenshots of the new screens', async ({ page }) => {
  test.setTimeout(180000);
  await login(page, 'parts');
  await publish(page.request, [
    ['9971001', VIN, '0071001', '00717171', '00717171', 'وارد موجودی شده است', '1405/08/29', '1', 'چراغ جلو ساختگی'],
    ['9971001', VIN, '0071002', '00727272', '00727272', 'در مرحله خرید', '', '1', 'سپر عقب ساختگی'],
    ['9971009', 'TESTVIN9990', '0071009', '00797979', '00797979', 'در حال تامین', '', '1', 'آینه ساختگی'],
  ]);

  // Existing page as the reference.
  await page.goto('/cases');
  await page.locator('main').waitFor();
  const reference = await tokens(page);
  await page.screenshot({ path: `${SHOTS}/00-existing-cases.png`, fullPage: true });

  await page.goto('/special-aid/vehicles');
  const folders = page.getByTestId('aid-folders');
  await expect(folders.locator('.folder').filter({ hasText: VIN.slice(-6) }).first()).toBeVisible();
  expect(await tokens(page)).toMatchObject({ font: reference.font, bg: reference.bg, text: reference.text });
  // The dossier card is the existing folder card with the existing Iranian plate component.
  await expect(folders.locator('.folder.cov-own').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-vehicles.png`, fullPage: true });

  await folders.locator('.folder').filter({ hasText: VIN.slice(-6) }).first().getByRole('link', { name: 'باز کردن پرونده' }).click();
  await page.waitForURL(/\/special-aid\/vehicles\/[0-9a-f-]+$/);
  await expect(page.getByTestId('aid-items').getByTestId('aid-item')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'کارت پذیرش' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-dossier.png`, fullPage: true });

  await page.goto('/special-aid/vehicles');
  await page.getByRole('button', { name: 'شاسی نامعتبر' }).click();
  await expect(page.getByText('TESTVIN9990')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-vin-review.png`, fullPage: true });
  await page.getByRole('button', { name: 'کارت‌های پذیرش' }).click();
  await expect(page.getByRole('heading', { name: 'بایگانی کارت پذیرش' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-card-archive.png`, fullPage: true });

  await page.goto('/special-aid');
  await page.locator('main').waitFor();
  await page.screenshot({ path: `${SHOTS}/01-today.png`, fullPage: true });

  // The bell replaces page-top banners.
  await expect(page.getByRole('button', { name: /^اعلان‌ها/ })).toBeVisible();
});

test('service manager: management report, feedback page and the report center', async ({ page }) => {
  test.setTimeout(120000);
  await login(page, 'manager');
  await page.goto('/special-aid/reports');
  await expect(page.getByRole('heading', { name: 'گزارش مدیریتی امداد ویژه' })).toBeVisible();
  await expect(page.locator('.kpis .kpi').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-reports.png`, fullPage: true });
  await page.goto('/special-aid/feedback');
  await expect(page.getByRole('heading', { name: 'بازخورد فنی و تذکر رسمی' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-feedback.png`, fullPage: true });
  await page.goto('/');
  await page.locator('main').waitFor();
  await page.screenshot({ path: `${SHOTS}/00-existing-dashboard.png`, fullPage: true });
});
