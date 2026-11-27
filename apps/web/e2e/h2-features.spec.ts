import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// H2 central switch (owner, 2026-11-27), daily config: «manager» is the owner, nothing is opened by
// OPEN_FEATURES. Closed modules (stoppages, /modules/*) are gone for staff — menu, direct link and
// API — and shown to the owner with a small «آزمایشی» tag; Special Aid stays open, tagged for the owner.
const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های منیج' });
const links = (page: Page) => nav(page).locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
/** One section is open at a time: open each in turn and collect every link of the menu. */
const allLinks = async (page: Page) => {
  const heads = nav(page).locator('.nav-group-head');
  const seen = new Set(await links(page));
  for (let i = 0; i < (await heads.count()); i++) {
    if ((await heads.nth(i).getAttribute('aria-expanded')) !== 'true') await heads.nth(i).click();
    for (const h of await links(page)) seen.add(h);
  }
  return [...seen];
};
const section = async (page: Page, name: string) => {
  const head = nav(page).getByRole('button', { name, exact: true });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
};

test('H2 staff: closed modules are not in the menu, their links show «به‌زودی», their API answers 404', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'admin');
  const hrefs = await allLinks(page);
  expect(hrefs).toContain('/cases');
  expect(hrefs).not.toContain('/reception/stoppage');
  expect(hrefs).not.toContain('/control-room/stoppages');
  expect(hrefs.some((h) => h?.startsWith('/modules/'))).toBe(false);
  for (const path of ['/reception/stoppage', '/control-room/stoppages', '/modules/parts_inventory']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'به‌زودی' }), path).toBeVisible();
    await expect(page.locator('main .stp-card, main .stp-kpi')).toHaveCount(0);
  }
  await page.screenshot({ path: info.outputPath('h2-staff-coming-soon.png') });
  expect((await page.request.get('/api/v1/stoppages')).status()).toBe(404);
  expect((await page.request.get('/api/v1/stoppages/report')).status()).toBe(404);
  // Special Aid stays open to staff, without the tag.
  await page.goto('/special-aid/vehicles');
  await expect(page.getByRole('heading', { level: 1, name: 'به‌زودی' })).toHaveCount(0);
  await expect(page.locator('.tag-exp')).toHaveCount(0);
});

test('H2 owner: sees every module, closed and unfinished ones tagged «آزمایشی»', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'manager');
  await section(page, 'پذیرش و جست‌وجو');
  const stoppage = nav(page).getByRole('link', { name: 'خودروهای متوقف', exact: true });
  await expect(stoppage).toBeVisible();
  await expect(stoppage.locator('.tag-exp')).toHaveText('آزمایشی');
  await section(page, 'مدیر خدمات');
  await expect(nav(page).getByRole('link', { name: 'گزارش خودروهای متوقف', exact: true }).locator('.tag-exp')).toHaveText('آزمایشی');
  await section(page, 'امداد ویژه و نوبت');
  await expect(nav(page).getByRole('link', { name: 'پرونده خودروها', exact: true }).locator('.tag-exp')).toHaveText('آزمایشی');
  await section(page, 'تصادفات');
  await expect(nav(page).getByRole('link', { name: 'پرونده و کارشناسی', exact: true }).locator('.tag-exp')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('h2-owner-menu.png') });
  await page.goto('/reception/stoppage');
  await expect(page.getByRole('heading', { level: 1, name: 'خودروهای متوقف' })).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'جز مالک کسی آن را نمی‌بیند' })).toBeVisible();
  expect((await page.request.get('/api/v1/stoppages')).status()).toBe(200);
  await page.goto('/special-aid/vehicles');
  await expect(page.getByRole('note').filter({ hasText: 'کارکنان آن را بدون این برچسب می‌بینند' })).toBeVisible();
});
