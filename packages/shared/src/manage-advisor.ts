/**
 * Manage internal decision support. No AI or external service is called here.
 * Never treat the recommendation as permission to buy or company eligibility.
 */
export type ManageSupplyRoute = 'reserve' | 'market' | 'emdad';
export type ManageAdvice = {
  route: ManageSupplyRoute | null;
  confidence: 'high' | 'medium' | 'low';
  headline: string;
  why: string[];
  required: string[];
};
export type ManageSupplyFacts = {
  partCode: string | null;
  quantity: number;
  available: number;
  companyPriceRial: number | null;
  salePriceRial: number | null;
  coverage: string;
  leadDays: number | null;
  workingDaysLeft: number | null;
  blocking: boolean;
  hasDestination: boolean;
};
export function manageSupplyAdvice(f: ManageSupplyFacts): ManageAdvice {
  const why: string[] = [];
  const required: string[] = [];
  if (!f.hasDestination) required.push('جایگاه مقصد تعمیر را پیش از تحویل تعیین کنید');
  if (!f.partCode) {
    why.push('کد فنی معتبر ثبت نشده است؛ از تطبیق قطعات مشابه بدون بررسی خودداری کنید.');
  }
  if (f.available >= f.quantity && f.quantity > 0 && !!f.partCode) {
    why.push('موجودی قابل رزروِ همین کد برای تعداد درخواستی کافی است.');
    if (f.blocking) why.push('واحد تعمیر همین حالا به قطعه نیاز دارد؛ برداشت از موجودی معمولاً انتظار تأمین را کم می‌کند.');
    if (f.salePriceRial === null) required.push('قیمت فروش قطعه را بررسی و ثبت کنید');
    return { route: 'reserve', confidence: 'high', headline: 'پیشنهاد منیج: رزرو از موجودی',
      why, required };
  }
  why.push('موجودی قابل رزرو برای تأمین کامل این نیاز کافی نیست.');
  const leadFits = f.leadDays !== null && f.workingDaysLeft !== null && f.leadDays <= f.workingDaysLeft;
  const leadLate = f.leadDays !== null && f.workingDaysLeft !== null && f.leadDays > f.workingDaysLeft;
  if (leadLate) why.push('میانگین رسیدن امداد ویژه از فرصت باقی‌ماندهٔ برنامه تعمیر بیشتر است.');
  if (f.blocking) why.push('توقف فعلی کارگاه، بررسی سریع قیمت و زمان تأمین را ضروری می‌کند.');
  if (f.coverage === 'golden_card' && leadFits && !f.blocking) {
    why.push('با توجه به سوابق ثبت‌شده، زمان متوسط امداد در فرصت برنامه تعمیر می‌گنجد.');
    required.push('شمول قطعه و مجوز درخواست در سامانه رسمی امداد ویژه را بررسی کنید');
    required.push('شماره درخواست واقعی امداد ویژه را وارد کنید');
    if (f.companyPriceRial === null) required.push('قیمت شرکت را بررسی و وارد کنید');
    return { route: 'emdad', confidence: 'medium', headline: 'پیشنهاد مشروط منیج: بررسی امداد ویژه',
      why, required };
  }
  if (f.coverage === 'golden_card')
    why.push('پیش از خرید بازار، امکان سفارش رسمی امداد ویژه و محدودیت‌های کارت طلایی را بررسی کنید.');
  required.push('ابتدا استعلام فروشنده، قیمت و اعتبار پیشنهاد را ثبت کنید');
  if (f.coverage === 'golden_card' || f.coverage === 'insurance')
    required.push('تأیید واقعی پرداخت‌کننده و مرجع رسمی آن قبل از خرید الزامی است');
  return { route: 'market', confidence: f.blocking || leadLate ? 'medium' : 'low',
    headline: 'پیشنهاد منیج: استعلام خرید بازار', why, required };
}
