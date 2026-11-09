import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../playwright.config';

export async function login(page: Page, username: string) {
  // Staff PIN is the default tab; the password form is the owner/system-admin tab.
  await page.goto('/login?mode=staff');
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('رمز عبور').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page.getByRole('button', { name: 'خروج', includeHidden:true })).toBeAttached();
}

export async function openCaseSections(page: Page, ...ids: string[]) {
  await expect(page.locator('.case-hero')).toBeVisible();
  for (const id of ids) {
    const section = page.locator(`#case-${id}`);
    if (await section.count() && await section.getAttribute('open') === null) await section.locator(':scope > summary').click();
  }
}
