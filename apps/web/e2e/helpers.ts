import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../playwright.config';

export async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('رمز عبور').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page.getByRole('button', { name: 'خروج' })).toBeAttached();
}
