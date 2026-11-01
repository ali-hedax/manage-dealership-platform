import { test } from '@playwright/test';
import { login } from './helpers';

// Regenerates docs/screenshots from the synthetic demo data.
// Run with: SCREENSHOTS=1 pnpm --filter @manage/web test:e2e screenshots
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate documentation screenshots');

const out = (name: string, project: string) => `../../docs/screenshots/${project}-${name}.png`;

test('documentation screenshots', async ({ page }, info) => {
  const project = info.project.name;
  await page.goto('/login');
  await page.screenshot({ path: out('login', project) });

  await login(page, 'manager');
  await page.goto('/');
  await page.getByRole('navigation', { name: 'مراحل پرونده‌ها' }).waitFor();
  await page.screenshot({ path: out('dashboard', project), fullPage: true });

  await page.goto('/cases');
  await page.locator('tbody tr').first().waitFor();
  await page.screenshot({ path: out('cases', project), fullPage: true });

  await page.getByLabel('جست‌وجوی پرونده').fill('09000000002');
  await page.waitForURL(/q=09000000002/);
  await page.locator('tbody tr').filter({ hasText: 'مشتری نمونه دو' }).click();
  await page.locator('.timeline li').first().waitFor();
  await page.screenshot({ path: out('case-detail', project), fullPage: true });

  await page.goto('/cases/new');
  await page.getByLabel('پلاک').waitFor();
  await page.screenshot({ path: out('case-new', project), fullPage: true });
});
