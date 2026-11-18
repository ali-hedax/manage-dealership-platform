import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Approved design (owner, 2026-11-18; docs/design/mockups/approved-2026-11-18):
// case folder, accident desk, parts desk and service dashboard on real pages with
// synthetic demo data. With SCREENSHOTS=1 the desktop captures are written to
// docs/screenshots/approved-2026-11-18 (synthetic data only, no customer data).
const SHOTS = !!process.env.SCREENSHOTS;
const doc = (name: string) => `../../docs/screenshots/approved-2026-11-18/${name}.png`;
async function shot(page: Page, name: string, outputPath: (n: string) => string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: SHOTS ? doc(name) : outputPath(`${name}.png`) });
}
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test.describe.configure({ mode: 'serial' });

test('case folder: cream folder, real plate, coverage and «تعویض اتاق», vehicle column and daily actions', async ({ page }, info) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await login(page, 'expert');
  await page.goto('/cases');
  await page.locator('tbody tr').filter({ hasText: 'مشتری نمونه یک' }).click();
  const head = page.locator('.cf2-folder');
  await expect(head.getByRole('heading', { level: 1, name: 'دنا پلاس' })).toBeVisible();
  await expect(head.locator('.cf2-tab')).toHaveText('پرونده خودرو');
  await expect(head.locator('.clip-gold')).toBeVisible();
  // Plate from the case's own data: blue strip, digits-letter-digits, «ایران» and the two-digit code.
  const plate = head.getByRole('img', { name: /پلاک/ });
  await expect(plate.locator('.flag-ir')).toContainText('IRAN');
  await expect(plate.locator('.seg')).toHaveText('۱۱ب۱۱۱');
  await expect(plate.locator('.region')).toHaveText('ایران۱۰');
  await expect(head.getByTestId('coverage-badge')).toHaveText('کارت طلایی');
  await expect(head.getByTestId('body-replacement-badge')).toHaveText('تعویض اتاق');
  const side = page.getByRole('complementary', { name: 'مشخصات خودرو و اقدامات' });
  await expect(side.getByTestId('vehicle-placeholder')).toBeVisible();
  for (const k of ['مدل', 'سال ساخت', 'رنگ', 'VIN']) await expect(side.getByText(k, { exact: true })).toBeVisible();
  await expect(side.getByRole('link', { name: 'ویرایش پرونده' })).toBeVisible();
  await expect(side.getByRole('button', { name: 'چاپ' })).toBeVisible();
  await side.getByText('بیشتر ⋯').click();
  await expect(side.getByRole('link', { name: 'پذیرش بعدی' })).toBeVisible();
  await side.getByText('بیشتر ⋯').click();
  await expect(page.getByText('ثبت برآورد جدید')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'مسیر خودرو' }).getByRole('listitem')).toHaveCount(6);
  await shot(page, 'case-folder-desktop', (n) => info.outputPath(n));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('case-folder-390.png'), fullPage: true });
});

test('«تعویض اتاق» is an independent tick at intake and edit, shown only when set', async ({ page }) => {
  await login(page, 'expert');
  await page.goto('/cases');
  await page.locator('tbody tr').filter({ hasText: 'مشتری نمونه دو' }).click();
  await expect(page.locator('.cf2-folder')).toBeVisible();
  await expect(page.getByTestId('body-replacement-badge')).toHaveCount(0);
  await page.getByRole('link', { name: 'ویرایش پرونده' }).click();
  const tick = page.getByRole('checkbox', { name: 'تعویض اتاق' });
  await expect(tick).not.toBeChecked();
  await tick.check();
  await page.getByRole('button', { name: /ذخیره/ }).first().click();
  await expect(page.locator('.cf2-folder')).toBeVisible();
  await expect(page.getByTestId('body-replacement-badge')).toBeVisible();
  await expect(page.getByTestId('coverage-badge')).toBeVisible();
  await page.getByRole('link', { name: 'ویرایش پرونده' }).click();
  await page.getByRole('checkbox', { name: 'تعویض اتاق' }).uncheck();
  await page.getByRole('button', { name: /ذخیره/ }).first().click();
  await expect(page.locator('.cf2-folder')).toBeVisible();
  await expect(page.getByTestId('body-replacement-badge')).toHaveCount(0);
});

test('accident desk: rows with case slip and narrow clip, filters, direct inspection print', async ({ page }, info) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await login(page, 'expert');
  await page.goto('/accidents/expert');
  await expect(page.getByRole('heading', { level: 1, name: 'میز تصادفات' })).toBeVisible();
  await expect(page.getByTestId('print-inspection')).toBeVisible();
  await expect(page.getByRole('link', { name: 'پذیرش خودرو' })).toBeVisible();
  const rows = page.getByTestId('accident-row');
  const total = await rows.count();
  expect(total).toBeGreaterThan(0);
  await expect(rows.first().locator('.clip-row')).toBeVisible();
  await expect(rows.first().locator('.arow-slip')).toContainText('پرونده شماره');
  await expect(page.getByText('ثبت برآورد جدید')).toHaveCount(0);
  await page.getByLabel('نوع پرونده').selectOption('body');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const r of await rows.all()) await expect(r.getByTestId('body-replacement-badge')).toBeVisible();
  await page.getByLabel('نوع پرونده').selectOption('all');
  await page.getByLabel('پوشش').selectOption('gold');
  for (const b of await rows.getByTestId('coverage-badge').all()) await expect(b).toHaveText('کارت طلایی');
  await page.getByLabel('پوشش').selectOption('all');
  await expect(rows).toHaveCount(total);
  await rows.first().locator('summary').click();
  await expect(rows.first().getByRole('link', { name: 'قطعات' })).toBeVisible();
  await rows.first().locator('summary').click();
  await shot(page, 'accident-desk-desktop', (n) => info.outputPath(n));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('accident-desk-390.png'), fullPage: true });
});

test('parts desk: car picker on the side, list in the main area, direct primary action', async ({ page }, info) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await login(page, 'parts');
  await page.goto('/accidents/parts');
  await expect(page.getByRole('heading', { level: 2, name: 'انتخاب خودرو' })).toBeVisible();
  const picker = page.locator('.car-list button');
  await expect(picker.first()).toBeVisible();
  await expect(picker.first().locator('.car-name small')).not.toBeEmpty();
  await expect(page.getByTestId('parts-ledger')).toBeVisible();
  const box = await page.locator('.pdesk-side').boundingBox();
  const main = await page.locator('.pdesk-main').boundingBox();
  // RTL: the car picker is on the right of the parts list.
  expect(box!.x).toBeGreaterThan(main!.x);
  await expect(page.locator('.part-primary').first()).toBeVisible();
  await shot(page, 'parts-desk-desktop', (n) => info.outputPath(n));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSideScroll(page)).toBe(true);
});

test('service manager: one graphite strip of four numbers, each opening its exact list; follow-ups before the map on mobile', async ({ page }, info) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await login(page, 'manager');
  await page.goto('/accidents/manager');
  const room = page.getByTestId('control-room');
  const strip = room.getByRole('region', { name: 'چهار شاخص مدیر خدمات' });
  await expect(strip.locator('.sd-kpi')).toHaveCount(4);
  for (const t of ['خودروهای حاضر', 'گذشته از مهلت رسمی', 'بدون مسئول', 'دارای مانع']) await expect(strip).toContainText(t);
  for (const key of ['present', 'overdue_official', 'unassigned', 'blocked']) {
    const n = Number((await room.getByTestId(`kpi-${key}`).locator('b').innerText()).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
    await room.getByTestId(`kpi-${key}`).click();
    const list = room.getByTestId('kpi-list');
    if (n) await expect(list.locator('tbody tr')).toHaveCount(n);
    else await expect(list).toContainText('خودرویی نیست');
    await room.getByTestId(`kpi-${key}`).click();
  }
  await expect(room.getByRole('region', { name: 'پیگیری امروز' })).toBeVisible();
  await expect(room.getByTestId('workshop-scene')).toBeVisible();
  const map = await room.getByRole('region', { name: 'نقشهٔ زندهٔ کارگاه' }).boundingBox();
  const queue = await room.getByRole('region', { name: 'پیگیری امروز' }).boundingBox();
  expect(map!.x).toBeGreaterThan(queue!.x);
  await shot(page, 'service-manager-desktop', (n) => info.outputPath(n));
  await page.setViewportSize({ width: 390, height: 844 });
  const m2 = await room.getByRole('region', { name: 'نقشهٔ زندهٔ کارگاه' }).boundingBox();
  const q2 = await room.getByRole('region', { name: 'پیگیری امروز' }).boundingBox();
  expect(q2!.y).toBeLessThan(m2!.y);
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('service-manager-390.png'), fullPage: true });
});
