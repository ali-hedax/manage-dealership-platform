import {expect,test} from '@playwright/test';
import {writeSheet} from '../../api/src/parts/xlsx';
import {login,openCaseSections} from './helpers';

test('imports a parts catalog, then selects a technical code while adding a case part',async({page})=>{
 await login(page,'admin');await page.goto('/reference-data');
 await page.getByLabel('فایل اکسل اطلاعات پایه').setInputFiles({name:'synthetic-parts.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(writeSheet('قطعات',[['کد فنی','نام قطعه','موجودی'],['00042','چراغ آزمون مرجع','7']]))});
 await page.getByRole('combobox',{name:'کد فنی',exact:true}).selectOption('0');await page.getByRole('combobox',{name:'نام قطعه',exact:true}).selectOption('1');await page.getByRole('combobox',{name:'موجودی فایل',exact:true}).selectOption('2');
 await page.getByRole('button',{name:'پیش‌نمایش اطلاعات پایه',exact:true}).click();
 const preview=page.getByTestId('reference-preview');await expect(preview).toContainText('جدید: ۱');
 page.once('dialog',d=>void d.accept());await preview.getByRole('button',{name:'ثبت ۱ ردیف اطلاعات پایه'}).click();await expect(preview.getByRole('heading',{name:'نتیجه ورود'})).toBeVisible();
 const cases=await page.request.get('/api/v1/cases');const first=(await cases.json()).items[0];await page.goto(`/cases/${first.id}`);await openCaseSections(page,'parts');
 await page.getByRole('button',{name:'افزودن قطعه',exact:true}).click();
 await page.getByRole('dialog').getByText('انتخاب از کاتالوگ قطعات',{exact:true}).click();await page.getByLabel('کد فنی یا نام قطعه',{exact:true}).fill('00042');await page.getByRole('button',{name:'جست‌وجو در اطلاعات پایه',exact:true}).click();await page.getByRole('button',{name:'انتخاب این قطعه',exact:true}).click();
 await expect(page.getByLabel('شرح قطعه *',{exact:true})).toHaveValue('چراغ آزمون مرجع');await expect(page.getByLabel('شماره فنی',{exact:true})).toHaveValue('00042');
});

test('historical customer lookup fills only empty fields and works on a phone width',async({page})=>{
 await login(page,'admin');
 const input={kind:'customers',fileName:'synthetic-customers.xlsx',fileBase64:Buffer.from(writeSheet('سوابق',[['شاسی','نام','تلفن','مدل'],['TESTARCHIVE01','مالک سابق آزمون','09000000001','مدل سابق آزمون']])).toString('base64'),sheetIndex:0,headerRow:1,mapping:{chassis:0,fullName:1,phone:2,model:3}};
 const p=await page.request.post('/api/v1/reference-imports',{headers:{'x-manage-client':'test'},data:input});expect(p.ok()).toBe(true);const id=(await p.json()).id;expect((await page.request.post(`/api/v1/reference-imports/${id}/apply`,{headers:{'x-manage-client':'test'},data:{}})).ok()).toBe(true);
 await page.setViewportSize({width:390,height:844});await page.goto('/cases/new');await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('مالک فعلی آزمون');await page.getByText('جست‌وجو در سوابق اطلاعات پایه',{exact:true}).click();await page.locator('details').filter({hasText:'جست‌وجو در سوابق اطلاعات پایه'}).getByLabel('VIN کامل یا شماره شاسی عین سابقه').fill('TESTARCHIVE01');await page.getByRole('button',{name:'جست‌وجو در اطلاعات پایه'}).click();await expect(page.getByText('مالک سابق آزمون — مدل سابق آزمون')).toBeVisible();await page.getByRole('button',{name:'استفاده از اطلاعات این سابقه'}).click();
 await expect(page.getByLabel('نام و نام خانوادگی',{exact:true})).toHaveValue('مالک فعلی آزمون');await expect(page.getByLabel('تلفن همراه',{exact:true})).toHaveValue('09000000001');await expect(page.getByLabel('VIN (شماره شاسی)',{exact:true})).toHaveValue('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('long manufacturer trim, editable contacts and admission numbers save without the old 80-character error',async({page})=>{
 await login(page,'admin');await page.goto('/cases/new');
 await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('مشتری سازمانی آزمون '.repeat(12));
 await page.getByLabel('مدل',{exact:true}).fill('ری‌را');await page.getByLabel('تیپ',{exact:true}).fill('شرح کامل مشخصات و تجهیزات کارخانه '.repeat(20));
 await page.getByLabel('شماره کارت پذیرش ایران‌خودرو',{exact:true}).fill('1405777777');
 await page.getByLabel('زمان پذیرش واقعی',{exact:true}).fill('۱۴۰۵/۰۷/۰۱ ۰۹:۱۵:۰۰');await page.getByLabel('زمان پذیرش واقعی',{exact:true}).press('Tab');
 await page.getByRole('button',{name:'ثبت پرونده',exact:true}).click();await expect(page.getByRole('link',{name:'ویرایش پرونده'})).toBeVisible();await expect(page.getByText('شماره پذیرش ایران‌خودرو:',{exact:false}).first()).toContainText('۱۴۰۵۷۷۷۷۷۷');
 await page.getByRole('link',{name:'ویرایش پرونده',exact:true}).click();await expect(page.getByLabel('تیپ',{exact:true})).toHaveValue('شرح کامل مشخصات و تجهیزات کارخانه '.repeat(20).trim());await page.getByText('جست‌وجو در سوابق اطلاعات پایه',{exact:true}).click();await page.locator('details').filter({hasText:'جست‌وجو در سوابق اطلاعات پایه'}).getByLabel('VIN کامل یا شماره شاسی عین سابقه').fill('TESTARCHIVE01');await page.getByRole('button',{name:'جست‌وجو در اطلاعات پایه'}).click();await page.getByRole('button',{name:'استفاده از اطلاعات این سابقه'}).click();await expect(page.getByLabel('تلفن همراه',{exact:true})).toHaveValue('09000000001');await page.getByLabel('تلفن همراه',{exact:true}).fill('09000000009');await page.getByRole('button',{name:'ذخیره تغییرات',exact:true}).click();await expect(page.getByRole('link',{name:'ویرایش پرونده'})).toBeVisible();
 await page.goto('/cases?q=1405777777');await expect(page.getByRole('table')).toContainText('۱۴۰۵۷۷۷۷۷۷');await expect(page.getByRole('table').getByRole('link').first()).toHaveText(/AC-/);await expect(page.getByRole('table')).toContainText('ایران خودرو ری را');await expect(page.getByRole('table')).not.toContainText('شرح کامل مشخصات و تجهیزات کارخانه');
});
