import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { login } from './helpers';

// Design evidence for the HEDAX Signature redesign: screenshots of every main
// screen, horizontal-overflow checks at six widths, a text-contrast scan and
// basic loading metrics. Synthetic demo data only.
// Run with: SIGNATURE_EVIDENCE=1 SIGNATURE_OUT=<dir> pnpm --filter @manage/web exec playwright test signature-evidence --project=desktop
test.skip(!process.env.SIGNATURE_EVIDENCE, 'set SIGNATURE_EVIDENCE=1 to capture design evidence');
test.describe.configure({ mode: 'serial' });

const OUT = process.env.SIGNATURE_OUT ?? 'test-results/signature-evidence';
const UI = process.env.SIGNATURE_UI; // optional ?ui= override (signature | classic)
const shots = join(OUT, 'screens');
mkdirSync(shots, { recursive: true });
const report: Record<string, unknown> = { ui: UI ?? 'default', generatedAt: new Date().toISOString() };
const save = () => writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const WIDTHS = [360, 390, 768, 1024, 1440, 1920];

async function go(page: Page, path: string) {
  const url = UI ? `${path}${path.includes('?') ? '&' : '?'}ui=${UI}` : path;
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

async function caseId(page: Page, customer: string) {
  const res = await page.request.get(`/api/v1/cases?q=${encodeURIComponent(customer)}`);
  const body = await res.json();
  return body.items[0].id as string;
}

/** Pages that exceed the viewport width; the plate and intentional inner scrollers are allowed. */
async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
}

/** Visible text whose contrast against its nearest opaque background is below WCAG AA. */
async function contrastFailures(page: Page) {
  return page.evaluate(() => {
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const bgOf = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) >= 0.95) return c.slice(0, 3);
      }
      return parse(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    };
    const fails: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !n.textContent?.trim()) continue;
      seen.add(el);
      if (el.closest('[aria-hidden="true"],.sr-only,.skip-link,option,script,style')) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0 || Number(cs.opacity) < 0.5) continue;
      if (el.closest('button:disabled,[aria-disabled="true"]')) continue;
      // Gradient-filled text (background-clip:text) is checked by eye in the screenshots.
      if ((cs as unknown as { webkitBackgroundClip?: string }).webkitBackgroundClip === 'text') continue;
      const fg = parse(cs.color);
      const bg = bgOf(el);
      const [a, b] = [lum(fg.slice(0, 3)), lum(bg)];
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) fails.push(`${ratio.toFixed(2)} ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} «${n.textContent.trim().slice(0, 30)}»`);
    }
    return fails;
  });
}

const ROUTES: { role: string; name: string; path: string | ((p: Page) => Promise<string>) }[] = [
  { role: 'manager', name: 'dashboard', path: '/' },
  { role: 'manager', name: 'launch', path: '/launch' },
  { role: 'manager', name: 'cases', path: '/cases' },
  { role: 'manager', name: 'case-detail', path: async (p) => `/cases/${await caseId(p, '09000000002')}` },
  { role: 'manager', name: 'case-new', path: '/cases/new' },
  { role: 'manager', name: 'reports', path: '/reports?view=manager' },
  { role: 'manager', name: 'reports-people', path: '/reports/people' },
  { role: 'manager', name: 'workshop', path: '/workshop' },
  { role: 'manager', name: 'users-denied', path: '/users' },
  { role: 'manager', name: 'reminders', path: '/reminders' },
  { role: 'manager', name: 'reference-data', path: '/reference-data' },
  { role: 'manager', name: 'daily-reports', path: '/daily-reports' },
  { role: 'manager', name: 'stock', path: '/stock' },
  { role: 'manager', name: 'emdad', path: '/emdad' },
  { role: 'manager', name: 'workshop-settings', path: '/workshop/settings' },
  { role: 'manager', name: 'module-planned', path: '/modules/sales' },
  { role: 'admin', name: 'users', path: '/users' },
  { role: 'admin', name: 'admin-desk', path: '/accidents/admin' },
  { role: 'parts', name: 'parts-workbench', path: '/accidents/parts' },
  { role: 'expert', name: 'expert-desk', path: '/accidents/expert' },
  { role: 'technician', name: 'technician', path: '/workshop/technician' },
  { role: 'technician', name: 'technician-work', path: '/workshop/technician/work' },
];

test('login screens', async ({ page }) => {
  for (const [label, size] of [['desktop', DESKTOP], ['mobile', MOBILE]] as const) {
    await page.setViewportSize(size);
    await go(page, '/login');
    await page.screenshot({ path: join(shots, `login-${label}.png`) });
  }
  report.loginContrast = await contrastFailures(page);
  save();
});

test('every route: screenshots, overflow and contrast', async ({ page }) => {
  test.setTimeout(600_000);
  const overflowFails: string[] = [];
  const contrast: Record<string, string[]> = {};
  let current = '';
  for (const r of ROUTES) {
    if (r.role !== current) { await page.setViewportSize(DESKTOP); await login(page, r.role); current = r.role; }
    const path = typeof r.path === 'string' ? r.path : await r.path(page);
    await page.setViewportSize(DESKTOP);
    await go(page, path);
    await page.screenshot({ path: join(shots, `${r.name}-desktop.png`), fullPage: true });
    const c = await contrastFailures(page);
    if (c.length) contrast[r.name] = c.slice(0, 15);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(150);
      const o = await overflow(page);
      if (o > 1) overflowFails.push(`${r.name}@${w}: +${o}px`);
    }
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(shots, `${r.name}-mobile.png`), fullPage: true });
  }
  report.overflow = overflowFails;
  report.contrast = contrast;
  save();
});

test('loading metrics', async ({ page, browser }) => {
  await login(page, 'manager');
  const metrics: Record<string, unknown> = {};
  for (const [name, path] of [['dashboard', '/'], ['case-list', '/cases'], ['login', '/login']] as const) {
    const ctx = await browser.newContext({ storageState: name === 'login' ? undefined : await page.context().storageState(), viewport: DESKTOP });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Performance.enable');
    await p.addInitScript(() => {
      (window as unknown as { __m: Record<string, number> }).__m = { lcp: 0, cls: 0, long: 0 };
      const m = (window as unknown as { __m: Record<string, number> }).__m;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => { m.long += l.getEntries().length; }).observe({ type: 'longtask', buffered: true });
    });
    let js = 0, css = 0;
    p.on('response', async (res) => {
      const t = res.request().resourceType();
      const len = Number((await res.allHeaders())['content-length'] ?? 0) || (await res.body().catch(() => Buffer.alloc(0))).length;
      if (t === 'script') js += len; else if (t === 'stylesheet') css += len;
    });
    const url = UI ? `${path}?ui=${UI}` : path;
    const t0 = Date.now();
    await p.goto(url);
    await p.waitForLoadState('networkidle');
    const loadMs = Date.now() - t0;
    await p.waitForTimeout(800);
    const m = await p.evaluate(() => (window as unknown as { __m: Record<string, number> }).__m);
    const perf = await cdp.send('Performance.getMetrics');
    const heap = perf.metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0;
    // Frame pacing while hovering interactive surfaces for one second.
    const frames = await p.evaluate(async () => {
      const ts: number[] = [];
      await new Promise<void>((done) => { const start = performance.now(); const tick = (t: number) => { ts.push(t); if (t - start < 1000) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });
      const d = ts.slice(1).map((t, i) => t - ts[i]);
      return { frames: d.length, worstMs: Math.round(Math.max(...d)), over20ms: d.filter((x) => x > 20).length };
    });
    metrics[name] = { loadMs, lcpMs: Math.round(m.lcp), cls: Number(m.cls.toFixed(4)), longTasks: m.long, jsBytes: js, cssBytes: css, heapMB: Number((heap / 1048576).toFixed(1)), frames };
    await ctx.close();
  }
  report.metrics = metrics;
  save();
  expect(Object.keys(metrics)).toHaveLength(3);
});

test('reduced motion, print, keyboard focus and the classic switch', async ({ browser }) => {
  const checks: Record<string, unknown> = {};
  // Motion runs normally and stops completely when the user asks for reduced motion.
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion });
    const p = await ctx.newPage();
    await login(p, 'manager');
    await go(p, '/');
    await p.goto(UI ? `/?ui=${UI}` : '/');
    await p.getByRole('navigation', { name: 'مراحل پرونده‌ها' }).waitFor();
    checks[`animations_${reducedMotion}`] = await p.evaluate(() => document.getAnimations().length);
    // Nothing keeps animating once the page has settled (no idle GPU work).
    await p.waitForTimeout(1500);
    checks[`runningAfterSettle_${reducedMotion}`] = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const p = await ctx.newPage();
  await login(p, 'manager');
  await go(p, '/');
  // Print keeps the light, ink-saving layout.
  await p.emulateMedia({ media: 'print' });
  checks.printPanelBackground = await p.locator('.panel').first().evaluate((e) => getComputedStyle(e).backgroundColor);
  checks.printBodyColor = await p.evaluate(() => getComputedStyle(document.body).color);
  await p.emulateMedia({ media: 'screen' });
  // Keyboard: the first Tab reaches the skip link and shows a visible focus ring.
  await p.keyboard.press('Tab');
  checks.firstFocus = await p.evaluate(() => document.activeElement?.textContent?.trim());
  await p.keyboard.press('Tab');
  checks.secondFocusRing = await p.evaluate(() => { const e = document.activeElement as HTMLElement; const cs = getComputedStyle(e); return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none'; });
  // The classic interface is one parameter away, and the choice is remembered.
  await p.goto('/?ui=classic');
  await p.getByRole('navigation', { name: 'مراحل پرونده‌ها' }).waitFor();
  checks.classicAttr = await p.evaluate(() => document.documentElement.dataset.ui);
  checks.classicInstrumentVisible = await p.locator('.sx-instrument').isVisible();
  await p.goto('/');
  await p.getByRole('navigation', { name: 'مراحل پرونده‌ها' }).waitFor();
  checks.classicRemembered = await p.evaluate(() => document.documentElement.dataset.ui);
  await p.screenshot({ path: join(shots, 'dashboard-classic-switch.png') });
  await p.goto('/?ui=signature');
  await p.getByRole('navigation', { name: 'مراحل پرونده‌ها' }).waitFor();
  checks.signatureAttr = await p.evaluate(() => document.documentElement.dataset.ui);
  checks.signatureInstrumentVisible = await p.locator('.sx-instrument').isVisible();
  await ctx.close();
  report.checks = checks;
  save();
  expect(checks.animations_reduce).toBe(0);
  expect(checks.runningAfterSettle_reduce).toBe(0);
  expect(checks.classicInstrumentVisible).toBe(false);
  expect(checks.signatureInstrumentVisible).toBe(true);
});

test('interaction recording', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: DESKTOP, recordVideo: { dir: join(OUT, 'video'), size: DESKTOP } });
  const p = await ctx.newPage();
  await p.goto(UI ? `/login?mode=staff&ui=${UI}` : '/login?mode=staff');
  await p.waitForTimeout(1600);
  await p.getByLabel('نام کاربری').fill('manager');
  await p.getByLabel('رمز عبور').fill((await import('../playwright.config')).E2E_PASSWORD);
  await p.getByRole('button', { name: 'ورود' }).click();
  await p.waitForURL(/\/launch$|\/$/);
  await p.goto('/');
  await p.getByRole('navigation', { name: 'مراحل پرونده‌ها' }).waitFor();
  await p.waitForTimeout(1200);
  for (const el of await p.locator('.sx-readout').all()) { await el.hover(); await p.waitForTimeout(350); }
  await p.goto('/launch');
  await p.waitForTimeout(600);
  for (const el of (await p.locator('.workspace-card').all()).slice(0, 3)) { await el.hover({ position: { x: 40, y: 20 } }); await p.waitForTimeout(250); await el.hover({ position: { x: 200, y: 60 } }); await p.waitForTimeout(350); }
  await p.goto(`/cases/${await caseId(p, '09000000002')}`);
  await p.locator('.case-hero').waitFor();
  await p.waitForTimeout(800);
  const section = p.locator('#case-tasks > summary');
  if (await section.count()) { await section.click(); await p.waitForTimeout(900); }
  await p.getByRole('button', { name: 'تذکر' }).first().click();
  await p.waitForTimeout(1000);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  const video = p.video();
  await ctx.close();
  if (video) await video.saveAs(join(OUT, 'video', 'signature-interactions.webm'));
});
