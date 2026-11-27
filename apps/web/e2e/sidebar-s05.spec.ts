import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Slice S05 (owner, 2026-11-27): side menu numbered ۰–۹ in matte black with safety yellow for
// «you are here»; each role sees only its own sections; modules not built yet (۳ سالن, ۷ مشتری و
// پیامک, the roadmap) are hidden; one section open at a time; a way back on every page.
const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های منیج' });
const heads = (page: Page) => nav(page).locator('.nav-group-head');
const headNames = async (page: Page) => (await heads(page).evaluateAll((hs) => hs.map((h) => h.querySelector('.nav-num + span')?.textContent?.trim() ?? '')));
const headNumbers = async (page: Page) => heads(page).locator('.nav-num').allInnerTexts();
const hrefs = async (page: Page) => nav(page).locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
const DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const ROLES: { user: string; home: RegExp; sections: string[]; hidden: string[] }[] = [
  { user: 'expert', home: /\/accidents\/expert$/, sections: ['تقسیم کار', 'تصادفات', 'امداد ویژه و نوبت', 'انبار و قطعات', 'تنظیمات'], hidden: ['پذیرش و جست‌وجو', 'مدیر خدمات'] },
  { user: 'parts', home: /\/accidents\/parts$/, sections: ['پذیرش و جست‌وجو', 'انبار و قطعات', 'تنظیمات'], hidden: ['مدیر خدمات'] },
  // The demo service manager is the owner: everything that exists, still not the hidden modules.
  { user: 'manager', home: /\/accidents\/(manager|owner)$/, sections: ['پذیرش و جست‌وجو', 'تقسیم کار', 'تصادفات', 'مدیر خدمات', 'تنظیمات'], hidden: [] },
];

for (const r of ROLES) {
  test(`S05 ${r.user}: ۰ میزکار من first, own sections in number order, hidden modules never shown`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, r.user);
    const first = nav(page).locator(':scope > a').first();
    await expect(first).toContainText('میزکار من');
    await expect(first.locator('.nav-num')).toHaveText('۰');
    await first.click();
    await expect(page).toHaveURL(r.home);
    await expect(nav(page).locator(':scope > a').first()).toHaveAttribute('aria-current', 'page');
    const names = await headNames(page);
    for (const s of r.sections) expect(names).toContain(s);
    for (const s of [...r.hidden, 'سالن', 'مشتری و پیامک', 'نقشهٔ راه']) expect(names).not.toContain(s);
    // Fixed numbers, ascending; a hidden section leaves its number out.
    const nums = (await headNumbers(page)).map((n) => DIGITS.indexOf(n.trim()));
    expect(nums.every((n) => n >= 1 && n <= 9 && n !== 3 && n !== 7)).toBe(true);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    await expect(nav(page).getByText('در دست توسعه')).toHaveCount(0);
    expect((await hrefs(page)).some((h) => h?.startsWith('/modules/'))).toBe(false);
    // Accordion: opening one section closes the other; never the same destination twice.
    if ((await heads(page).count()) > 1) {
      await heads(page).nth(0).click();
      await expect(heads(page).nth(0)).toHaveAttribute('aria-expanded', 'true');
      await heads(page).nth(1).click();
      await expect(heads(page).nth(1)).toHaveAttribute('aria-expanded', 'true');
      await expect(heads(page).nth(0)).toHaveAttribute('aria-expanded', 'false');
    }
    for (let i = 0; i < (await heads(page).count()); i++) {
      if ((await heads(page).nth(i).getAttribute('aria-expanded')) !== 'true') await heads(page).nth(i).click();
      const all = await hrefs(page);
      expect(new Set(all).size).toBe(all.length);
    }
  });
}

test('S05 identity: matte black menu, thin icons, yellow «you are here»', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'expert');
  await page.goto('/cases');
  const side = page.getByRole('complementary', { name: 'منوی اصلی' });
  expect(await side.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(10, 10, 11)');
  const current = nav(page).getByRole('link', { name: 'پرونده و کارشناسی' });
  await expect(current).toHaveAttribute('aria-current', 'page');
  expect(await current.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(255, 196, 0)');
  await expect(nav(page).getByRole('button', { name: 'تصادفات', exact: true })).toHaveAttribute('aria-expanded', 'true');
  const strokes = await nav(page).locator('svg.app-icon').evaluateAll((s) => [...new Set(s.map((x) => getComputedStyle(x).strokeWidth))]);
  expect(strokes).toEqual(['1.25px']);
  await page.screenshot({ path: info.outputPath('s05-desktop.png') });
  // Compact mode keeps the numbers and «میزکار من».
  await page.getByRole('button', { name: 'جمع کردن منو' }).click();
  await expect(nav(page).locator('.nav-group-items')).toHaveCount(0);
  await expect(nav(page).getByRole('link', { name: 'میزکار من' })).toBeVisible();
});

test('S05 technician: only «۰ میزکار من», which is the own job list', async ({ page }) => {
  await login(page, 'technician');
  await nav(page).getByRole('link', { name: 'میزکار من' }).click();
  await expect(page).toHaveURL(/\/workshop\/technician$/);
  await expect(nav(page).locator('a')).toHaveCount(1);
  await expect(heads(page)).toHaveCount(0);
});

test('S05 every page has a way back except the own desk', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'expert');
  // The own desk is the one page without a way back.
  await nav(page).getByRole('link', { name: 'میزکار من' }).click();
  await expect(page).toHaveURL(/\/accidents\/expert$/);
  await expect(page.locator('main').getByRole('link', { name: /^بازگشت/ })).toHaveCount(0);
  for (const path of ['/cases', '/parts', '/reports', '/settings', '/stock', '/workshop', '/emdad', '/cases/new', '/reminders', '/workshop/settings']) {
    await page.goto(path);
    await expect(page.locator('main').getByRole('link', { name: /^بازگشت/ }).first(), `back link on ${path}`).toBeVisible();
  }
  await page.goto('/settings');
  await page.locator('main').getByRole('link', { name: 'بازگشت به میز کار' }).click();
  await expect(page).toHaveURL(/\/accidents\/expert$/);
});

test('S05 mobile: the menu opens over the page, sections work, no horizontal scroll', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'expert');
  await page.getByRole('button', { name: 'منو', exact: true }).click();
  await nav(page).getByRole('button', { name: 'امداد ویژه و نوبت', exact: true }).click();
  await expect(nav(page).getByRole('link', { name: 'امداد ویژه تصادفات' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('s05-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'منو', exact: true })).toBeFocused();
});
