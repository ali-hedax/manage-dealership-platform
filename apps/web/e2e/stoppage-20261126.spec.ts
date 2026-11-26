import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { writeSheet } from '../../api/src/parts/xlsx';
import { login } from './helpers';

// «خودروهای متوقف» (owner, 2026-11-26): the parts clerk uploads the official «گزارش توقف خودرو»
// (the owner's anonymised sample, rebuilt as .xlsx with the real cell types), the service manager
// sees the cards, one case with its locked stepper, and the manager report. Screenshots at 1440,
// 1366 and 390 are attached for the PR.

const csv = (text: string) => text.replace(/^\uFEFF/u, '').split(/\r?\n/).filter(Boolean).map((line) => {
  const out: string[] = []; let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true; else if (ch === ',') { out.push(cell); cell = ''; } else cell += ch;
  }
  out.push(cell);
  return out;
});
const grid = csv(readFileSync(join(__dirname, '..', '..', 'api', 'test', 'fixtures', 'stoppage-sample-anon.csv'), 'utf8'));
const xlsx = Buffer.from(writeSheet('توقف خودرو', grid.map((r, ri) => r.map((v, ci) => (ri > 0 && [0, 6, 12].includes(ci) && /^\d+$/.test(v) ? Number(v) : v)))));

test('stopped vehicles: upload, cards, case stepper and manager report', async ({ page }, info) => {
  await login(page, 'parts');
  await page.goto('/reception/stoppage');
  await expect(page.getByRole('heading', { name: 'خودروهای متوقف', level: 1 })).toBeVisible();
  await page.getByText('بارگذاری گزارش توقف خودرو (Excel)').click();
  await page.getByLabel('فایل گزارش توقف خودرو').setInputFiles({ name: 'stoppage.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx });
  await expect(page.getByText(/۳۶ ردیف · ۲۸ اعلام توقف · ۳ توقف فعال/)).toBeVisible();
  await page.getByRole('button', { name: 'ثبت گزارش' }).click();
  await expect(page.getByText(/گزارش توقف ثبت شد|قبلاً ثبت شده بود/)).toBeVisible();

  await login(page, 'manager');
  await page.goto('/reception/stoppage');
  const card = page.locator('a.stp-card', { hasText: 'SDK82226' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('تارا');
  // The long model description never appears on the card.
  await expect(card).not.toContainText('TU5P');
  for (const [width, height] of [[1440, 900], [1366, 860], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/reception/stoppage');
    await expect(page.locator('a.stp-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const file = info.outputPath(`stoppage-list-${width}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    await info.attach(`stoppage-list-${width}`, { path: file, contentType: 'image/png' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/reception/stoppage');
  await page.locator('a.stp-card', { hasText: 'SDK82226' }).click();
  await expect(page.getByRole('list', { name: 'مراحل توقف' })).toBeVisible();
  await expect(page.getByText('مرحلهٔ فعلی: ارسال به ستاد')).toBeVisible();
  await expect(page.getByText('03709152')).toBeVisible();
  await expect(page.getByText('مشخصات کامل')).toBeVisible();
  await expect(page.getByRole('link', { name: 'بازگشت به خودروهای متوقف' })).toBeVisible();
  for (const [width, height] of [[1440, 900], [1366, 860], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(page.getByRole('list', { name: 'مراحل توقف' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const file = info.outputPath(`stoppage-case-${width}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    await info.attach(`stoppage-case-${width}`, { path: file, contentType: 'image/png' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/control-room/stoppages');
  await expect(page.getByRole('heading', { name: 'خودروهای متوقف · گزارش مدیریتی' })).toBeVisible();
  await expect(page.getByText('مقایسه با لیست شب')).toBeVisible();
  const file = info.outputPath('stoppage-report-1440.png');
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  await info.attach('stoppage-report-1440', { path: file, contentType: 'image/png' });
});
