import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PERMISSIONS } from '@manage/shared';
import { login, openCaseSections } from './helpers';

// Phase 3 documentation screenshots from synthetic data only (docs/screenshots/phase3).
// Run with: SCREENSHOTS=1 pnpm --filter @manage/web exec playwright test phase3-screenshots --project=desktop
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate the phase 3 screenshots');

const DIR = '../../docs/screenshots/phase3';
const headers = { 'x-manage-client': 'test' };
const SIZES = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;

async function shoot(page: Page, name: string) {
  for (const [label, size] of Object.entries(SIZES)) {
    await page.setViewportSize(size);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/${name}-${label}.png`, fullPage: label === 'mobile' });
  }
}

test('phase 3 screenshots', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run covers both sizes');
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });

  await login(page, 'expert');
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  const staff = await (await page.request.get('/api/v1/workshop/staff')).json();
  const technician = staff.find((s: { displayName: string }) => s.displayName === 'تعمیرکار نمونه');
  const supervisor = staff.find((s: { displayName: string }) => s.displayName === 'سرپرست نمونه');
  const departments = await (await page.request.get('/api/v1/departments')).json();
  const dept = (code: string) => departments.find((d: { code: string }) => d.code === code).id;
  const mk = async (plate: string, vin: string, coverageType: string) =>
    (await (await page.request.post('/api/v1/cases', { headers, data: { customer: { fullName: 'مشتری ساختگی تصویر', phone: `0900000${vin.slice(-4)}` }, vehicle: { brand: 'ایران‌خودرو', model: 'دنا پلاس', color: 'سفید', plate, vin }, admittedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), coverageType, responsibleUserId: me.id } })).json());
  const first = await mk('۶۸ ط ۴۲۱ - ۱۱', 'TESTVIN0000SHOT01', 'golden_card');
  const second = await mk('۲۲ ج ۲۲۲ - ۱۶', 'TESTVIN0000SHOT02', 'personal');
  const job = async (caseId: string, title: string, code: string, days: number) =>
    (await (await page.request.post(`/api/v1/cases/${caseId}/tasks`, { headers, data: { departmentId: dept(code), assignedUserId: technician.id, title, plannedStartAt: new Date().toISOString(), durationDays: days } })).json());
  const a = await job(first.id, 'گلگیر و درب جلو راست', 'body', 2);
  const b = await job(second.id, 'سپر جلو', 'body', 1);
  for (const [t, amount] of [[a, 45_000_000], [b, 30_000_000]] as const) {
    expect((await page.request.put(`/api/v1/tasks/${t.id}/wage`, { headers, data: { amountRial: amount, expectedVersion: 0 } })).ok()).toBe(true);
  }
  await page.request.post('/api/v1/reminders', { headers, data: { userIds: [technician.id], caseId: first.id, body: 'قطعه آماده است؛ تحویل بگیر.', urgency: 'urgent' } });

  // Technician: finish and get the second job approved so the month has a total.
  await login(page, 'technician');
  await page.request.post(`/api/v1/workshop/my-tasks/${b.id}/actions`, { headers, data: { action: 'start', expectedVersion: 1 } });
  await page.request.post(`/api/v1/workshop/my-tasks/${b.id}/actions`, { headers, data: { action: 'complete', expectedVersion: 2 } });
  await page.request.post(`/api/v1/workshop/my-tasks/${a.id}/problem`, { headers, data: { problem: 'part_late' } });
  await login(page, 'expert');
  await page.request.post(`/api/v1/tasks/${b.id}/actions`, { headers, data: { action: 'approve', expectedVersion: 3 } });
  await page.request.post('/api/v1/reminders', { headers, data: { userIds: [supervisor.id], caseId: second.id, body: 'پنج هشدار پیش‌پرداخت بی‌جواب مانده؛ لطفاً امروز تکلیفشان را روشن کن.' } });
  const version = (await (await page.request.get(`/api/v1/cases/${first.id}`)).json()).version;
  await page.request.post(`/api/v1/cases/${first.id}/transfer`, { headers, data: { toUserId: supervisor.id, reason: 'تقسیم کار هفتگی', expectedVersion: version } });

  await page.goto('/reminders');
  await expect(page.getByRole('heading', { name: 'تذکرهای من' })).toBeVisible();
  await page.getByRole('button', { name: /^فرستاده/ }).click();
  await shoot(page, 'reminders');

  await page.setViewportSize(SIZES.desktop);
  await page.goto(`/cases/${first.id}`);
  await openCaseSections(page, 'tasks');
  await expect(page.getByTestId('responsibility-bar').locator('li')).toHaveCount(2);
  await shoot(page, 'responsibility-bar');

  await login(page, 'technician');
  await page.goto('/workshop/technician');
  await expect(page.getByTestId('reminder-card').first()).toBeVisible();
  await shoot(page, 'technician-card');
  await page.goto('/workshop/technician/work');
  await expect(page.getByTestId('my-work-total')).toBeVisible();
  await shoot(page, 'my-work');

  // Owner controls with a synthetic owner session and synthetic report rows.
  await login(page, 'manager');
  await page.route('**/api/v1/auth/me', async (route) => { const r = await route.fetch(); await route.fulfill({ json: { ...(await r.json()), isOwner: true, permissions: [...PERMISSIONS] } }); });
  const now = new Date().toISOString();
  await page.route('**/api/v1/access/admin-actions*', (route) => route.fulfill({ json: {
    month: '1405-08', label: 'آبان ۱۴۰۵', months: [{ key: '1405-08', label: 'آبان ۱۴۰۵' }],
    admins: [{ id: '00000000-0000-4000-8000-0000000000a1', displayName: 'مدیر سیستم نمونه', isActive: true, canManageStaff: false, version: 3 }],
    rows: [
      { id: '00000000-0000-4000-8000-0000000000b1', occurredAt: now, actor: { id: '00000000-0000-4000-8000-0000000000a1', displayName: 'مدیر سیستم نمونه' }, action: 'user.technician_pin_reset', actionLabel: 'رمز تازه و باز کردن قفل تعمیرکار', entityType: 'user', caseId: null, caseNumber: null, reason: 'رمز را فراموش کرده بود' },
      { id: '00000000-0000-4000-8000-0000000000b2', occurredAt: now, actor: { id: '00000000-0000-4000-8000-0000000000a1', displayName: 'مدیر سیستم نمونه' }, action: 'case.updated', actionLabel: 'ویرایش پرونده', entityType: 'case', caseId: first.id, caseNumber: first.caseNumber, reason: 'اشتباه تایپی پلاک' },
    ],
  } }));
  await page.goto('/users#owner-admin');
  await page.getByTestId('owner-admin').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('owner-admin')).toContainText('رمز را فراموش کرده بود');
  for (const [label, size] of Object.entries(SIZES)) {
    await page.setViewportSize(size);
    await page.getByTestId('owner-admin').screenshot({ path: `${DIR}/owner-controls-${label}.png` });
  }
});
