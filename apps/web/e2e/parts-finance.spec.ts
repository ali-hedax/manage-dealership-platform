import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Issues #9 and #10 in the browser, on demo case 3 (personal payment): the
// customer approved the estimate and the expert proposed an advance.
async function openCase3(page: Page, user: string) {
  // Leave the app first: a background request of the old page would otherwise
  // get 401 after the cookies are cleared and redirect, aborting our navigation.
  await page.goto('about:blank');
  await page.context().clearCookies();
  await login(page, user);
  await page.goto('/cases?q=' + encodeURIComponent('مشتری نمونه سه'));
  await page.locator('tbody tr').filter({ hasText: 'مشتری نمونه سه' }).click();
  await expect(page.getByTestId('finance-panel')).toBeVisible();
}

test('advance approval and receipt open the purchase gate; parts clerk orders, receives, hands over and imports', async ({
  page,
}) => {
  const dialog = page.getByRole('dialog');
  const gate = page.getByTestId('finance-gate');

  // Service manager approves the expert's advance (not their own proposal).
  await openCase3(page, 'manager');
  await expect(gate).toContainText('پیش‌پرداخت دریافت نشده');
  const advance = page.getByTestId('finance-approval').first();
  await expect(advance).toContainText('منتظر تأیید مدیر');
  await advance.getByRole('button', { name: 'تأیید مدیر' }).click();
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(advance).toContainText('تأیید مدیر');
  await expect(gate).toContainText('پیش‌پرداخت دریافت نشده');

  // Cashier confirms receipt.
  await openCase3(page, 'cashier');
  await page.getByTestId('finance-approval').first().getByRole('button', { name: 'تأیید دریافت' }).click();
  await dialog.getByLabel('شماره پیگیری / رسید پرداخت *').fill('POS-E2E-1');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(gate).toContainText('پیش‌پرداخت دریافت شده');

  // Parts clerk: order the approved mirror, receive it, hand it over.
  await openCase3(page, 'parts');
  const mirror = page.getByTestId('part').filter({ hasText: 'آینه بغل چپ' });
  await expect(mirror).toContainText('نیاز ثبت شد');
  await mirror.getByRole('button', { name: 'سفارش قطعه' }).click();
  await dialog.getByLabel('تأمین‌کننده', { exact: true }).fill('فروشگاه آزمون');
  await expect(dialog.getByLabel('قیمت واحد خرید (ریال) *')).toHaveValue('14000000');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(mirror).toContainText('سفارش داده شد');

  await mirror.getByRole('button', { name: 'رسید و کنترل قطعه' }).click();
  await dialog.getByLabel('شماره رسید انبار').fill('RCV-E2E-1');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(mirror).toContainText('رسید و کنترل شد');

  await mirror.getByRole('button', { name: 'تحویل به واحد تعمیر' }).click();
  await dialog.getByLabel('واحد تعمیر').selectOption({ label: 'مونتاژ و دمونتاژ' });
  await dialog.getByLabel('تحویل‌گیرنده *').fill('تکنسین آزمون');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(mirror).toContainText('تحویل واحد تعمیر');
  await expect(mirror).toContainText('تکنسین آزمون (مونتاژ و دمونتاژ)');

  // Excel import: preview first, then import all rows of the sample.
  await page.getByTestId('parts-panel').getByRole('button', { name: 'ورود از اکسل' }).click();
  await dialog.getByLabel('فایل اکسل (.xlsx)').setInputFiles('public/samples/parts-import-sample.xlsx');
  await expect(dialog.getByTestId('import-preview')).toContainText('۴ ردیف آماده ورود');
  await dialog.getByRole('button', { name: 'ورود ۴ ردیف' }).click();
  await expect(page.getByTestId('part')).toHaveCount(5);
  await expect(page.getByTestId('parts-panel')).toContainText('آرم صندوق');

  // History (not visible to the parts clerk) records every step with its actor.
  await openCase3(page, 'manager');
  await expect(page.locator('.timeline')).toContainText('تحویل قطعه به واحد تعمیر');
  await expect(page.locator('.timeline')).toContainText('تأیید دریافت پیش‌پرداخت');
});
