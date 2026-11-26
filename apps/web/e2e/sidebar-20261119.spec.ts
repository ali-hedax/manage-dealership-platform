import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Final side menu (owner, 2026-11-19): «میزکار من» first, role-specific groups, one group
// open at a time, the current page highlighted, no destination twice, unfinished modules
// hidden from staff, and the compact icon mode. Screenshots go to docs with SCREENSHOTS=1.
const SHOTS = !!process.env.SCREENSHOTS;
const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های منیج' });
const groupNames = async (page: Page) => nav(page).locator('.nav-group-head').allInnerTexts();
const hrefs = async (page: Page) => nav(page).locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));

// «پذیرش و ترخیص» appears for roles with `stoppage.read` («خودروهای متوقف», owner 2026-11-26);
// its reception pages themselves still need reception.read and the Pulse module.
const ROLES: { user: string; home: RegExp; groups: string[]; hidden: string[] }[] = [
  { user: 'expert', home: /\/accidents\/expert$/, groups: ['مدیریت تصادفات', 'انبار قطعات یدکی', 'مدیریت تعمیرگاه'], hidden: ['پذیرش و ترخیص'] },
  { user: 'parts', home: /\/accidents\/parts$/, groups: ['انبار قطعات یدکی', 'پذیرش و ترخیص'], hidden: [] },
  { user: 'manager', home: /\/accidents\/manager$/, groups: ['مدیر خدمات', 'پذیرش و ترخیص'], hidden: [] },
];

for (const r of ROLES) {
  test(`${r.user}: lands on the same workspace, sees only its groups, one open at a time`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, r.user);
    // Sign-in keeps its landing page; «میزکار من» leads to the same desk as before.
    const first = nav(page).locator(':scope > a').first();
    await expect(first).toHaveText('میزکار من');
    await first.click();
    await expect(page).toHaveURL(r.home);
    await expect(nav(page).locator(':scope > a').first()).toHaveAttribute('aria-current', 'page');
    const groups = (await groupNames(page)).map((g) => g.trim());
    for (const g of r.groups) expect(groups).toContain(g);
    for (const g of r.hidden) expect(groups).not.toContain(g);
    expect(groups).not.toContain('رضایت مشتری');
    expect(groups.length).toBeLessThanOrEqual(7);
    await expect(nav(page).getByText('در دست توسعه')).toHaveCount(0);
    // Accordion: opening one group closes the other.
    const heads = nav(page).locator('.nav-group-head');
    if ((await heads.count()) > 1) {
      await heads.nth(0).click();
      await expect(heads.nth(0)).toHaveAttribute('aria-expanded', 'true');
      await heads.nth(1).click();
      await expect(heads.nth(1)).toHaveAttribute('aria-expanded', 'true');
      await expect(heads.nth(0)).toHaveAttribute('aria-expanded', 'false');
    }
    // No destination twice, and never the workspace again inside a group.
    for (let i = 0; i < (await heads.count()); i++) { if ((await heads.nth(i).getAttribute('aria-expanded')) !== 'true') await heads.nth(i).click(); const all = await hrefs(page); expect(new Set(all).size).toBe(all.length); }
    // Every icon in the menu is the same outline family at one size.
    const sizes = await nav(page).locator('svg.app-icon').evaluateAll((s) => [...new Set(s.map((x) => getComputedStyle(x).strokeWidth))]);
    expect(sizes).toEqual(['1.6px']);
    if (r.user === 'expert') {
      await page.goto('/accidents/expert');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: SHOTS ? '../../docs/screenshots/approved-2026-11-18/sidebar-desktop.png' : info.outputPath('sidebar-desktop.png'), clip: { x: 1440 - 280, y: 0, width: 280, height: 900 } });
    }
  });
}

test('the current page opens its group and is highlighted; compact mode keeps icons', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'expert');
  await page.goto('/cases');
  const accident = nav(page).getByRole('button', { name: 'مدیریت تصادفات' });
  await expect(accident).toHaveAttribute('aria-expanded', 'true');
  await expect(nav(page).getByRole('link', { name: 'پرونده و کارشناسی' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'جمع کردن منو' }).click();
  await expect(nav(page).locator('.nav-group-items')).toHaveCount(0);
  await expect(nav(page).getByRole('link', { name: 'میزکار من' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('sidebar-compact.png') });
  await accident.click();
  await expect(accident).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'جمع کردن منو' }).count();
});

test('technician keeps the two-item menu and My Tasks', async ({ page }) => {
  await login(page, 'technician');
  await nav(page).getByRole('link', { name: 'کارهای من' }).click();
  await expect(page).toHaveURL(/\/workshop\/technician$/);
  await expect(nav(page).locator('a')).toHaveCount(2);
  await expect(nav(page).locator('.nav-group-head')).toHaveCount(0);
});

test('mobile: menu opens over the page, groups work, no horizontal scroll', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'expert');
  await page.getByRole('button', { name: 'منو', exact: true }).click();
  await nav(page).getByRole('button', { name: 'انبار قطعات یدکی' }).click();
  await expect(nav(page).getByRole('link', { name: 'امداد ویژه تصادفات' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: SHOTS ? '../../docs/screenshots/approved-2026-11-18/sidebar-mobile.png' : info.outputPath('sidebar-mobile.png') });
});
