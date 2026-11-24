import {test,expect} from '@playwright/test';
import {login} from './helpers';
import {writeSheet} from '../../api/src/parts/xlsx';

test('duplicate reception blocks submission early, preserves inputs and opens the permitted existing case',async({page})=>{
  await login(page,'expert');
  const created=await page.request.post('/api/v1/cases',{headers:{'x-manage-client':'e2e'},data:{isLegacyEntry:true,admittedAt:new Date(Date.now()-60000).toISOString(),coverageType:'personal',vehicle:{vin:'TESTVIN0000198765',model:'تارای ساختگی'}}});
  expect(created.status()).toBe(201);const c=await created.json();
  await page.goto('/cases/new');
  await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('ورودی حفظ شود');
  await page.getByLabel('VIN (شماره شاسی)',{exact:true}).fill('testvin۰۰۰۰۱۹۸۷۶۵');
  const warning=page.getByTestId('duplicate-reception');
  await expect(warning).toContainText('امکان ثبت پذیرش مجدد وجود ندارد');
  await expect(warning).toContainText(c.caseNumber);
  await expect(page.locator('button[type=submit]')).toBeDisabled();
  await expect(page.getByLabel('نام و نام خانوادگی',{exact:true})).toHaveValue('ورودی حفظ شود');
  await page.getByLabel('VIN (شماره شاسی)',{exact:true}).fill('TESTVIN0000198766');
  await expect(warning).toHaveCount(0);await expect(page.locator('button[type=submit]')).toBeEnabled();
  await page.getByLabel('VIN (شماره شاسی)',{exact:true}).fill('TESTVIN0000198765');
  await warning.getByRole('link',{name:'مشاهده پرونده موجود'}).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${c.id}`));
});

test('product code stays visible between vehicle type and trim at desktop, tablet and mobile widths',async({page})=>{
  await login(page,'admin');const headers={'x-manage-client':'e2e'};
  const imported=await page.request.post('/api/v1/reference-imports',{headers,data:{kind:'customers',fileName:'synthetic-product.xlsx',fileBase64:Buffer.from(writeSheet('سوابق',[
    ['VIN','نام','کد محصول ایساکو'],['TESTVIN0000198770','مشتری ساختگی','001234'],
  ])).toString('base64'),sheetIndex:0,headerRow:1,mapping:{vin:0,fullName:1,isacoCode:2}}});
  expect(imported.status()).toBe(201);const imp=await imported.json();
  expect((await page.request.post(`/api/v1/reference-imports/${imp.id}/apply`,{headers,data:{}})).status()).toBe(201);
  const created=await page.request.post('/api/v1/cases',{headers,data:{isLegacyEntry:true,admittedAt:new Date(Date.now()-60000).toISOString(),coverageType:'personal',vehicle:{vin:'TESTVIN0000198770',model:'تارا',trim:'تیپ ساختگی'}}});
  expect(created.status()).toBe(201);const c=await created.json();expect(c.vehicle.isacoCode).toBe('001234');
  await page.goto(`/cases/${c.id}`);
  const header=page.getByLabel('شناسه فنی خودرو');
  for(const width of [1366,768,390]){
    await page.setViewportSize({width,height:860});
    await expect(header).toBeVisible();await expect(header).toContainText('۰۰۱۲۳۴');
    const spans=await header.locator('span').allTextContents();
    expect(spans[1]).toBe('تارا');expect(spans[2]).toContain('۰۰۱۲۳۴');expect(spans[3]).toContain('تیپ ساختگی');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  }
});
