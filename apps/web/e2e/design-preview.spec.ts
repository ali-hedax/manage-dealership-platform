import { expect, test, type Page } from '@playwright/test';

// Design preview (slices S03/S04): screenshots for the owner's approval, uploaded by CI as the
// «design-preview-screenshots» artifact. Synthetic data only; no login (static preview routes).
const DIR = 'test-results/design-preview-screenshots';
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function shoot(page: Page, route: string, name: string, sizes: [number, number][]) {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto(route);
    await expect(page.locator('.ds').first()).toBeVisible();
    await page.waitForTimeout(1300); // chart and bar animations settle
    expect(await noSideScroll(page), `${route} at ${width}px`).toBe(true);
    await page.screenshot({ path: `${DIR}/${name}-${width}.png`, fullPage: true, animations: 'disabled' });
  }
}

test('S03 design system: components in both themes', async ({ page }) => {
  await shoot(page, '/design-preview/components', 'components', [[1440, 900], [390, 844]]);
  await expect(page.getByRole('img', { name: /پلاک/ }).first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'مراحل پرونده' }).first()).toBeVisible();
});
