import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('reconstruction 1A reception screenshots', async ({ page }, info) => {
  await login(page, 'manager');
  await page.goto('/reception/open');
  await page.getByTestId('reception-row').first().click();
  await expect(page.getByTestId('reception-parts')).toBeVisible();
  const detail = page.url();
  await page.goto('/reception/night');
  const generate = page.getByRole('button', { name: 'ساخت پیش‌نویس همین حالا' });
  await generate.click();
  await expect(page.getByText('پیش‌نویس ساخته شد.')).toBeVisible();
  const routes = [['night', '/reception/night'], ['folder', detail]];
  if (process.env.CAPTURE_STOPPAGE === 'true') routes.push(['stoppage', '/reception/stoppage']);
  for (const [label, path] of routes) {
    for (const [width, height] of [[1440, 900], [1366, 860], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(path!);
      await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
      const ready = label === 'night' ? page.getByTestId('night-list')
        : label === 'folder' ? page.getByTestId('reception-parts') : page.getByText('در حال اعتبارسنجی');
      await expect(ready).toBeVisible();
      const file = info.outputPath(`${label}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
      await info.attach(`${label}-${width}`, { path: file, contentType: 'image/png' });
    }
  }
});
