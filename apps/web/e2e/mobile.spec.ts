import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('phone width: login, dashboard and case list fit without horizontal scrolling', async ({ page }) => {
  await login(page, 'manager');
  for (const path of ['/', '/cases']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
  await page.getByRole('button', { name: 'منو' }).click();
  const nav = page.getByRole('navigation', { name: 'بخش‌های منیج' });
  await expect(nav.getByRole('link', { name: 'میزکار من', exact: true })).toBeVisible();
  const accident = nav.getByRole('button', { name: 'مدیریت تصادفات' });
  if ((await accident.getAttribute('aria-expanded')) !== 'true') await accident.click();
  await expect(nav.getByRole('link', { name: 'پرونده و کارشناسی', exact: true })).toBeVisible();
});
