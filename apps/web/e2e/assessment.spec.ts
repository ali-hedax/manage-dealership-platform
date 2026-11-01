import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Issue #8 / acceptance scenario 5 in the browser: initial assessment,
// insurer authorization, then a supplement after hidden damage.
test('expert: assessment, authorization and a supplement that keeps the approved version', async ({ page }) => {
  await login(page, 'expert');

  const res = await page.request.post('/api/v1/cases', {
    headers: { 'x-manage-client': 'e2e' },
    data: {
      customer: { fullName: 'مشتری آزمون کارشناسی', phone: '09000003333' },
      vehicle: { brand: 'ایران‌خودرو', model: 'سورن', vin: 'TESTVIN00000E2E08' },
      odometerKm: 30000,
      admittedAt: new Date(Date.now() - 86_400_000).toISOString(),
      damageDescription: 'ضربه از جلو',
      coverageType: 'insurance',
      insurerName: 'بیمه آزمون',
      insuranceClaimNo: 'TEST-E2E-8',
    },
  });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  await page.goto(`/cases/${id}`);

  const panel = page.getByTestId('assessment-panel');
  const dialog = page.getByRole('dialog');

  // Initial assessment with one replaced part.
  await panel.getByRole('button', { name: 'شروع کارشناسی' }).click();
  await dialog.getByLabel('نام کارشناس *').fill('کارشناس بیمه آزمون');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(panel).toContainText('پیش‌نویس');
  await expect(page.locator('.case-hero')).toContainText('کارشناسی');

  await panel.getByRole('button', { name: 'افزودن قلم' }).click();
  await dialog.getByLabel('شرح *').fill('سپر جلو');
  await dialog.getByLabel('شماره فنی قطعه').fill('TEST-PN-100');
  await dialog.getByLabel('قیمت واحد قطعه (ریال)').fill('۴۰٬۰۰۰٬۰۰۰');
  await dialog.getByLabel('اجرت (ریال)').fill('5000000');
  await dialog.getByLabel('واحد اجرت').selectOption({ label: 'صافکاری' });
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(panel.getByTestId('assessment-total')).toHaveText('۴۵,۰۰۰,۰۰۰ ریال');

  await panel.getByRole('button', { name: 'نهایی کردن' }).click();
  await dialog.getByRole('button', { name: 'نهایی کردن' }).click();
  await expect(panel).toContainText('در انتظار مجوز');
  await expect(page.locator('.case-hero')).toContainText('در انتظار مجوز / تأیید');
  await expect(page.locator('.blocker').first()).toContainText('مجوز');

  // Insurer authorization requires the reference in the official system.
  await panel.getByRole('button', { name: 'ثبت مجوز' }).click();
  await expect(dialog.getByRole('button', { name: 'ثبت', exact: true })).toBeDisabled();
  await dialog.getByLabel('شماره ثبت در سامانه رسمی *').fill('TEST-AUTH-E2E');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(panel).toContainText('مجوز ثبت شد');
  await expect(page.getByText('مانعی ثبت نشده است.')).toHaveCount(0);
  await expect(page.locator('.case-hero')).not.toContainText('مانع باز');

  // Hidden damage: a supplement copies the approved lines and adds a new one.
  await panel.getByRole('button', { name: 'ثبت الحاقیه (آسیب پنهان)' }).click();
  await dialog.getByLabel('شرح آسیب پنهان *').fill('پس از دمونتاژ ترک سینی جلو دیده شد');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  const current = panel.getByTestId('assessment-version').first();
  await expect(current).toContainText('نسخه ۲ — الحاقیه');
  await expect(current.getByTestId('assessment-item')).toHaveCount(1);

  await current.getByRole('button', { name: 'افزودن قلم' }).click();
  await dialog.getByLabel('شرح *').fill('سینی جلو');
  await dialog.getByLabel('قیمت واحد قطعه (ریال)').fill('25000000');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(current).toContainText('جدید');
  await current.getByRole('button', { name: 'نهایی کردن' }).click();
  await dialog.getByRole('button', { name: 'نهایی کردن' }).click();

  await expect(current).toContainText('در انتظار مجوز');
  await expect(current).toContainText('نسبت به نسخه قبل: افزایش ۲۵,۰۰۰,۰۰۰ ریال');
  await expect(current).toContainText('تأیید مالی باید دوباره بررسی شود');
  await expect(page.locator('.case-hero')).toContainText('مانع باز');

  // The approved version is kept unchanged.
  await panel.getByText(/نسخه‌های قبلی/).click();
  const v1 = panel.getByTestId('assessment-version').nth(1);
  await expect(v1).toContainText('نسخه ۱ — کارشناسی اولیه');
  await expect(v1).toContainText('جایگزین‌شده');
  await expect(v1.getByTestId('assessment-total')).toHaveText('۴۵,۰۰۰,۰۰۰ ریال');

  await expect(page.locator('.timeline')).toContainText('شروع الحاقیه (آسیب پنهان)');

  // SCREENSHOTS=1 also refreshes the documentation image of this panel.
  if (process.env.SCREENSHOTS) await panel.screenshot({ path: '../../docs/screenshots/desktop-assessment.png' });
});
