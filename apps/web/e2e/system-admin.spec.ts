import {test,expect} from '@playwright/test';
import {PERMISSIONS} from '@manage/shared';
import {buildStockXlsx} from '../../api/src/daily-reports/fixtures';
import {login} from './helpers';

test('owner-configured support desk exposes daily upload, all operational queues and keeps owner controls protected',async({page},info)=>{
 await login(page,'manager');
 const catalog=await (await page.request.get('/api/v1/access')).json();
 const changed=await page.request.put('/api/v1/access/templates/system_admin',{headers:{'x-manage-client':'test'},data:{expectedVersion:catalog.version,permissions:[...PERMISSIONS]}});
 expect(changed.ok()).toBe(true);
 await login(page,'admin');await expect(page).toHaveURL(/\/launch$/);await page.getByRole('navigation',{name:'میزهای کار مجاز من'}).getByRole('link',{name:/مدیر سیستم/}).click();
 const me=await (await page.request.get('/api/v1/auth/me')).json();
 expect(me.isOwner).toBe(false);expect(me.permissions).toHaveLength(PERMISSIONS.length);
 const desk=page.getByRole('navigation',{name:'کارهای مدیر سیستم',exact:true});
 for(const summary of await desk.locator('details > summary').all())await summary.click();
 for(const name of ['به‌روزرسانی گزارش‌های روزانه','موجودی روزانه و رزرو','پیگیری امداد ویژه','پذیرش خودرو','برنامه و پیگیری تعمیر','مالی و تسویه','کنترل کیفیت و تحویل','گزارش جامع خدمات','کارکنان و دعوت'])await expect(desk.getByRole('link',{name:new RegExp(`^${name}(?:\\s|$)`)})).toBeVisible();
 await expect(page.getByRole('heading',{name:'پرونده‌ها برای پیگیری و پشتیبانی',exact:true})).toBeVisible();
 await expect(page.getByLabel('جست‌وجو در همین صف')).toBeVisible();
 await expect(page.getByTestId('daily-status')).toBeVisible();
 await page.screenshot({path:info.outputPath('support-desk-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('support-desk-mobile.png'),fullPage:true});
 await desk.getByRole('link',{name:/به‌روزرسانی گزارش‌های روزانه/}).click();
 await expect(page.getByRole('button',{name:'موجودی روزانه انبار',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'موجودی روزانه انبار',exact:true}).click();
 const file=buildStockXlsx([{'کد کالا':'8765432101','شرح کالا':'قطعه ساختگی پشتیبانی','موجودي':'2','قيمت فروش':'1000','قيمت ميانگين':'900','واحد شمارش':'عدد','آدرس':'TEST-A'}]);
 const upload=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/daily-reports/uploads?'));
 await page.getByLabel('انتخاب فایل').setInputFiles({name:'synthetic-admin-stock.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(file)});
 expect((await upload).ok()).toBe(true);
 await expect(page.getByTestId('daily-job')).toBeVisible();
 await expect(page.getByRole('button',{name:'ثبت گزارش',exact:true})).toBeVisible();
 // The non-owner support session cannot retrieve or mutate access administration.
 expect((await page.request.get('/api/v1/access')).status()).toBe(403);
 await page.goto('/users');await expect(page.locator('#access-control')).toHaveCount(0);
 await page.goto('/accidents/expert');await expect(page.getByRole('heading',{name:'میز کار مسئول تصادفات',exact:true})).toBeVisible();
 await page.goto('/accidents/owner');await expect(page.getByRole('heading',{name:'این میز کار برای شما فعال نیست',exact:true})).toBeVisible();
});
