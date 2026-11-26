// Synthetic data for the design preview (S03/S04). Invented names, plates and numbers only.
import type { VehicleCardData } from '@/components/ds';

export const P = (a: string, letter: string, b: string, region: string) => ({ a, letter, b, region });

export const VEHICLES: VehicleCardData[] = [
  { name: 'تارا', plate: P('۲۴', 'ب', '۳۱۸', '۱۶'), customer: 'سارا محمدی', stage: 'منتظر قطعه', day: 4, caseNo: 'AC-1405-0142', receptionNo: '14050086', status: 'warn', coverage: 'ins' },
  { name: 'دنا پلاس', plate: P('۵۳', 'ج', '۷۷۲', '۱۶'), customer: 'رضا کریمی', stage: 'صافکاری · جایگاه ۳۶', day: 2, caseNo: 'AC-1405-0139', receptionNo: '14050081', status: 'good', coverage: 'gold' },
  { name: 'ریرا', plate: P('۱۸', 'د', '۴۰۵', '۱۶'), customer: 'مهدی رحیمی', stage: 'کنترل کیفیت', day: 6, caseNo: 'AC-1405-0131', receptionNo: '14050077', status: 'info', coverage: 'own' },
  { name: 'سورن پلاس', plate: P('۶۷', 'س', '۹۱۲', '۱۶'), customer: 'زهرا اکبری', stage: 'تأخیر در تأمین قطعه', day: 11, caseNo: 'AC-1405-0118', receptionNo: '14050059', status: 'crit', coverage: 'ins' },
  { name: 'رانا', plate: P('۳۱', 'ق', '۲۲۴', '۱۶'), customer: 'علی نوری', stage: 'نقاشی · جایگاه ۹۹', day: 3, caseNo: 'AC-1405-0137', receptionNo: '14050083', status: 'good', coverage: 'ins' },
  { name: 'پژو ۲۰۷', plate: P('۷۲', 'م', '۶۴۸', '۱۶'), customer: 'نرگس صادقی', stage: 'مکانیک · جایگاه ۴۱', day: 1, receptionNo: '14050092', status: 'good', coverage: 'own' },
];

export const STATIONS = [
  { code: '۳۶', name: 'صافکاری', tech: 'TECH36', load: 92 },
  { code: '۹۹', name: 'نقاشی', tech: 'TECH99', load: 118 },
  { code: '۴۱', name: 'مکانیک', tech: 'TECH41', load: 64 },
  { code: '۲۲', name: 'جلوبندی', tech: 'TECH22', load: 71 },
  { code: '۱۲', name: 'برق', tech: 'TECH12', load: 48 },
  { code: '۵۵', name: 'سرویس سریع', tech: 'TECH55', load: 103 },
];

export const PARTS = [
  { vin: 'NAAN11FE0RH', name: 'سورن پلاس', plate: '۶۷ س ۹۱۲ - ۱۶', customer: 'زهرا اکبری', mobile: '۰۹۱۲•••۴۴۱۸', part: 'پمپ آب موتور EF7', code: '15922002', aid: '140500872400', arrived: '۱۴۰۵/۰۸/۲۹', daysLeft: 3 },
  { vin: 'NAAP03ED5RJ', name: 'تارا', plate: '۲۴ ب ۳۱۸ - ۱۶', customer: 'سارا محمدی', mobile: '۰۹۳۵•••۲۷۷۰', part: 'درپوش عقب گیربکس MT6', code: '06105108', aid: '140500875823', arrived: '۱۴۰۵/۰۹/۰۲', daysLeft: 9 },
  { vin: 'NAAL21CA8SK', name: 'ریرا', plate: '۱۸ د ۴۰۵ - ۱۶', customer: 'مهدی رحیمی', mobile: '۰۹۱۹•••۸۸۰۲', part: 'مانتینگ سر کمک جلو', code: '18130035', aid: '140500861553', arrived: '۱۴۰۵/۰۹/۰۴', daysLeft: 14 },
  { vin: 'NAAN77AB1RD', name: 'دنا پلاس', plate: '۵۳ ج ۷۷۲ - ۱۶', customer: 'رضا کریمی', mobile: '۰۹۱۰•••۱۹۳۴', part: 'غلتک سفت‌کن تسمه تایم', code: '11601022', aid: '140500869517', arrived: '۱۴۰۵/۰۹/۰۵', daysLeft: 17 },
];

export const AID_STEPS = ['درخواست', 'در خرید', 'رسیده', 'دعوت', 'نوبت', 'تعویض'];
export const CASE_STEPS = ['پذیرش', 'کارشناسی', 'برنامهٔ تعمیر', 'اجرای تعمیر', 'کنترل کیفیت', 'تحویل'];
