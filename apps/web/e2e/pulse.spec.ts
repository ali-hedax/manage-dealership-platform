import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';
test.use({ actionTimeout: 15_000 });

// «پذیرش و ترخیص» and «منیج پالس» (spec section 26) in the real browser, with the synthetic
// receptions of the demo seed (PULSE_ENABLED, no worker, nothing reaches کسب‌وکار). Screenshots
// of the new screens beside existing pages at 1440 and 390 px are uploaded by CI as the
// «pulse-screenshots» artifact.
const SHOTS = 'test-results-pulse/pulse-screenshots';
const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های منیج' });
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Design tokens that must equal those of the existing pages (no new palette or type). */
const tokens = (page: Page) => page.evaluate(() => {
  const css = (sel: string, prop: string) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).getPropertyValue(prop) : null; };
  return { font: css('body', 'font-family'), bg: css('body', 'background-color'), text: css('body', 'color'), panel: css('.panel', 'background-color') };
});

test('reception lists, folder, outside work and Manage Pulse settings use the existing design', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'manager'); // the owner of this suite

  // Existing pages first, for the side-by-side comparison.
  await page.goto('/settings');
  // Owner, 2026-11-23: four areas; every کسب‌وکار data source lives in «Manage Nexus».
  await expect(page.locator('.settings-card')).toHaveCount(4);
  await expect(page.getByRole('link', { name: /Manage Nexus/ })).toBeVisible();
  const reference = await tokens(page);
  await shot(page, 'existing-settings-desktop');
  await page.getByRole('link', { name: /Manage Nexus/ }).click();
  await expect(page).toHaveURL(/\/settings\/nexus$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Manage Nexus' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Manage Pulse/ })).toBeVisible();
  for (const name of ['پذیرش‌ها و قطعه‌های هر کارت', 'موجودی انبار']) await expect(page.locator('.nexus-row strong', { hasText: name })).toBeVisible();
  await page.locator('.nexus-row').filter({ hasText: 'موجودی انبار' }).getByText('راهنمای گرفتن این گزارش از کسب‌وکار').click();
  await expect(page.getByText(/جست‌وجوی بالای صفحه/)).toBeVisible();
  await shot(page, 'nexus-desktop');
  await page.goto('/daily-reports');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(page, 'existing-daily-reports-desktop');

  // The group appears only because the server flag is on; the roadmap no longer lists it.
  const reception = nav(page).getByRole('button', { name: 'پذیرش و جست‌وجو', exact: true });
  await reception.click();
  await nav(page).getByRole('link', { name: 'پذیرش‌های باز' }).click();
  await expect(page).toHaveURL(/\/reception\/open$/);
  await expect(page.getByRole('heading', { level: 1, name: 'پذیرش‌های باز' })).toBeVisible();
  await expect(page.getByText(/آخرین به‌روزرسانی از کسب‌وکار/)).toBeVisible();
  await expect(page.getByTestId('reception-row')).toHaveCount(3);
  await expect(page.getByTestId('reception-row').filter({ hasText: 'تصادفی' })).toHaveCount(1);
  const own = await tokens(page);
  expect({ font: own.font, bg: own.bg, text: own.text }).toEqual({ font: reference.font, bg: reference.bg, text: reference.text });
  await shot(page, 'reception-open-desktop');

  await page.getByRole('button', { name: 'ترخیص‌شده‌ها' }).click();
  await expect(page).toHaveURL(/\/reception\/released$/);
  await expect(page.getByTestId('reception-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'پذیرش‌های امروز' }).click();
  await expect(page.getByTestId('reception-row')).toHaveCount(2);
  await shot(page, 'reception-today-desktop');

  // Search by VIN (sent in the body, not the URL).
  // Wait until the open tab has really replaced the today tab; typing earlier lands in the old
  // list, whose state is thrown away when the new one mounts (the search then never runs).
  await page.getByRole('button', { name: 'پذیرش‌های باز' }).click();
  await expect(page).toHaveURL(/\/reception\/open$/);
  await expect(page.getByTestId('reception-row')).toHaveCount(3);
  const search = page.getByLabel('جست‌وجوی پذیرش');
  await expect(async () => {
    await search.fill('TESTVIN0000000001');
    await search.press('Enter');
    await expect(page.getByTestId('reception-row')).toHaveCount(1, { timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
  expect(page.url()).not.toContain('TESTVIN');

  // The reception folder: read-only lines from کسب‌وکار, a rejected part in grey with its reason.
  await page.getByTestId('reception-row').first().click();
  await expect(page).toHaveURL(/\/reception\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'قطعات' })).toBeVisible();
  await expect(page.getByTestId('reception-parts').locator('li')).toHaveCount(3);
  await expect(page.getByText('رد: عدم موجودی')).toBeVisible();
  await expect(page.getByRole('link', { name: /پروندهٔ تصادفی/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'بازگشت به پذیرش‌ها' })).toBeVisible();

  // Work outside the dealership: record, then cancel with a reason; both stay in the history.
  await page.getByRole('button', { name: 'ثبت کار بیرون' }).click();
  await page.getByLabel('نام انجام‌دهنده').fill('تراشکاری نمونه');
  await page.getByLabel('شرح کار').fill('تراش دیسک چرخ');
  await page.getByLabel('مبلغ (ریال)').fill('1500000');
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page.getByTestId('external-work')).toHaveCount(1);
  await expect(page.getByTestId('external-work')).toContainText('ارسال‌شده');
  await shot(page, 'reception-folder-desktop');
  await page.getByTestId('external-work').getByRole('button', { name: 'لغو' }).click();
  await page.getByLabel('علت لغو').fill('ثبت آزمایشی');
  await page.getByRole('button', { name: 'لغو کار' }).click();
  await expect(page.getByTestId('external-work')).toContainText('علت لغو: ثبت آزمایشی');
  await expect(page.getByText('کار خارج از نمایندگی لغو شد')).toBeVisible();
  const folder = page.url();

  // Manage Pulse settings: the password field is write-only, nothing is configured in this suite.
  await page.goto('/settings/pulse');
  await expect(page.getByRole('heading', { level: 1, name: /منیج پالس/ })).toBeVisible();
  await expect(page.getByTestId('pulse-sentence')).toHaveText(/پالس هنوز تنظیم نشده است/);
  await expect(page.getByLabel('کلمه عبور')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'شروع' })).toBeDisabled();
  await shot(page, 'pulse-settings-desktop');

  // Phone width: no sideways scrolling anywhere.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, path] of [['reception-today', '/reception'], ['reception-open', '/reception/open'], ['reception-released', '/reception/released'], ['reception-folder', folder], ['pulse-settings', '/settings/pulse'], ['existing-settings', '/settings'], ['nexus', '/settings/nexus'], ['special-aid-vehicles', '/special-aid/vehicles'], ['special-aid-reports', '/special-aid/reports']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await noSideScroll(page), `${path} at 390 px`).toBe(true);
    await shot(page, `${name}-mobile`);
  }
});

test('night lists (hotfix H1): repair and accident lists, station and reason dropdowns with free text, night report', async ({ page }) => {
  await login(page, 'manager');
  // A working day: today, or Thursday when today is Friday (the list is never built on a Friday).
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
  const noon = Date.parse(`${today}T12:00:00Z`);
  const day = new Date(noon).getUTCDay() === 5 ? new Date(noon - 86_400_000).toISOString().slice(0, 10) : today;
  for (const kind of ['repair', 'accident'] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/reception/night?day=${day}${kind === 'accident' ? '&kind=accident' : ''}`);
    await expect(page.getByRole('heading', { level: 1, name: kind === 'accident' ? 'لیست شب تصادفی' : 'لیست شب تعمیراتی' })).toBeVisible();
    const generate = page.getByRole('button', { name: 'ساخت پیش‌نویس همین حالا' });
    const list = page.getByTestId('night-list').or(page.getByText('خودرویی در این لیست ثبت نشده است.'));
    await expect(generate.or(list).first()).toBeVisible();
    if (await generate.isVisible()) {
      await generate.click();
      await expect(page.getByText('پیش‌نویس ساخته شد.')).toBeVisible();
    }
    await expect(list.first()).toBeVisible();
    // «گزارش شب»: total, oil change and technical repair (not exclusive), per receptionist.
    const summary = page.getByRole('region', { name: /گزارش شب/ });
    for (const label of ['کل پذیرش', 'تعویض روغن', 'تعمیر فنی']) await expect(summary.getByText(label, { exact: true }).first()).toBeVisible();
    // H2: the owner sees the C5 counts marked «آزمایشی».
    await expect(summary.locator('.tag-exp')).toHaveText('آزمایشی');
    if (kind === 'repair') {
      const table = page.getByTestId('night-list');
      await expect(table.getByRole('columnheader', { name: 'نام اجرت' })).toHaveCount(0);
      const current = table.getByLabel('جایگاه فعلی', { exact: true }).first();
      await expect(current.locator('option', { hasText: 'ندارد' })).toHaveCount(1);
      await current.selectOption({ label: 'جایگاه دیگر (نوشتن)…' });
      await table.getByLabel('جایگاه فعلی — نوشتن').first().fill('جایگاه ساختگی بیرون');
      await table.getByLabel('علت ماندن', { exact: true }).first().selectOption({ label: 'سایر' });
      await table.getByLabel('علت ماندن — نوشتن').first().fill('منتظر کارشناس بیمه');
      await table.getByRole('button', { name: 'ذخیره' }).first().click();
      await expect(page.getByText('ذخیره شد.')).toBeVisible();
      await expect(table.getByLabel('علت ماندن — نوشتن').first()).toHaveValue('منتظر کارشناس بیمه');
    }
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      expect(await noSideScroll(page), `night list ${kind} at ${width} px`).toBe(true);
      await shot(page, `night-${kind}-${width}`);
    }
  }
});

test('the reception API refuses a colleague without reception.read', async ({ page }) => {
  // The accident expert reads receptions since 2026-11-27; the parts clerk still does not.
  await login(page, 'parts');
  await expect(nav(page).getByRole('button', { name: 'پذیرش و جست‌وجو', exact: true })).toHaveCount(0);
  const res = await page.request.post('/api/v1/reception/search', { headers: { 'x-manage-client': 'e2e' }, data: { view: 'open' } });
  expect(res.status()).toBe(403);
  expect((await page.request.get('/api/v1/pulse/status')).status()).toBe(403);
});
