'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MODULE_LABELS, type ModuleKey } from '@manage/shared';

// Planned modules are visible so the roadmap is clear, but expose no actions.
const SCOPE: Record<string, string[]> = {
  reception: ['پذیرش عمومی و نوبت‌دهی', 'کارت کار و ثبت درخواست مشتری'],
  periodic_service: ['سرویس دوره‌ای', 'تعمیرات عادی و تاریخچه خودرو'],
  warranty: ['پرونده گارانتی', 'پیگیری تأیید خودروساز'],
  parts_inventory: ['موجودی، رزرو و درخواست قطعه', 'تأمین‌کنندگان و خرید', 'ورود Excel و سپس اتصال انبار'],
  finance: ['برآورد، پیش‌پرداخت و تأیید مالی', 'سهم شرکت، بیمه و مشتری', 'اتصال به حسابداری'],
  workforce: ['ظرفیت واحدها و تکنسین‌ها', 'کارتابل موبایل تکنسین'],
  customer_comms: ['پیامک وضعیت پرونده', 'رضایت‌سنجی و پورتال مشتری'],
  multi_dealership: ['چند نمایندگی و چند برند', 'تنظیمات مستقل هر نمایندگی'],
  integrations: ['اتصال رسمی و مجاز به خودروساز، امداد، بیمه، انبار و حسابداری'],
  ai_assistant: ['گزارش مدیریتی و تحلیل گلوگاه', 'پیشنهاد زمان تحویل بر پایه داده واقعی', 'بدون صدور مجوز مالی یا تعیین مقصر'],
};

export default function ModulePage() {
  const { key } = useParams<{ key: string }>();
  const label = MODULE_LABELS[key as ModuleKey];
  if (!label) return <div className="callout callout-red">این ماژول وجود ندارد.</div>;
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1>{label}</h1>
          <p className="muted small">این بخش در دست توسعه است و هنوز قابل استفاده نیست.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>دامنه برنامه‌ریزی‌شده</h2>
        </div>
        <div className="panel-body">
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {(SCOPE[key] ?? []).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="small muted" style={{ marginBottom: 0 }}>
            زمان‌بندی در نقشه راه پروژه ثبت می‌شود. تا آن زمان کار عملیاتی را در{' '}
            <Link href="/cases">پرونده‌های تصادفی</Link> انجام دهید.
          </p>
        </div>
      </section>
    </div>
  );
}
