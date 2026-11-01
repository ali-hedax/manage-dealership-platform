import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Issue #12 in the browser, on demo case 5 (personal): QC failed once, the
// corrective activity was approved, round 2 passed and the case is technically
// closed. The cashier settles and closes financially, the expert hands over.
async function openCase5(page: Page, user: string) {
  await page.goto('about:blank');
  await page.context().clearCookies();
  await login(page, user);
  await page.goto('/cases?q=' + encodeURIComponent('مشتری نمونه پنج'));
  await page.locator('tbody tr').filter({ hasText: 'مشتری نمونه پنج' }).click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
}

test('QC history, settlement, financial close and handover archive the case', async ({ page }) => {
  const dialog = page.getByRole('dialog');
  const panel = page.getByTestId('completion-panel');

  // QC inspector: both rounds visible, the corrective activity is marked.
  await openCase5(page, 'qc');
  await expect(page.getByTestId('qc-round')).toHaveCount(2);
  await expect(panel).toContainText('دور ۲: قبول');
  await expect(panel).toContainText('پوست‌پرتقالی روی لبه درب');
  await expect(page.getByTestId('task').filter({ hasText: 'کار اصلاحی کنترل کیفیت' })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'تحویل خودرو' })).toHaveCount(0);

  // Cashier: the balance blocks the close; record the settlement, then close.
  await openCase5(page, 'cashier');
  await expect(panel).toContainText('سهم مشتری کامل دریافت نشده است');
  await expect(panel.getByRole('button', { name: 'بستن مالی' })).toBeDisabled();
  await page.getByTestId('finance-panel').getByRole('button', { name: 'ثبت دریافت تسویه' }).click();
  await expect(dialog.getByLabel('مبلغ دریافتی (ریال) *')).toHaveValue('8000000');
  await dialog.getByLabel('شماره پیگیری / رسید پرداخت *').fill('POS-E2E-5');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(page.getByTestId('settlement-payment')).toContainText('POS-E2E-5');
  await panel.getByRole('button', { name: 'بستن مالی' }).click();
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(panel.getByText('انجام شد', { exact: true })).toHaveCount(2);

  // Expert: handover needs the recipient's confirmation; afterwards the case is archived.
  await openCase5(page, 'expert');
  await panel.getByRole('button', { name: 'تحویل خودرو' }).click();
  await expect(dialog.getByLabel('نام تحویل‌گیرنده *')).toHaveValue('مشتری نمونه پنج');
  const submit = dialog.getByRole('button', { name: 'ثبت', exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('تحویل‌گیرنده خودرو را بازدید کرد و برگه تحویل را امضا کرد *').check();
  await submit.click();
  await expect(page.getByTestId('delivery-done')).toContainText('تحویل به مشتری نمونه پنج (مالک)');
  await expect(page.getByTestId('delivery-done')).toContainText('بایگانی');
  await expect(page.locator('.case-hero')).toContainText('تحویل‌شده');
  await expect(page.getByRole('link', { name: 'ویرایش پرونده' })).toHaveCount(0);
});
