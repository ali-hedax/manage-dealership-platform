'use client';

import useSWR from 'swr';
import type { EmployeeScoreResult } from '@manage/shared';
import { fetcher } from '@/lib/api';
import { faNum, formatJalali } from '@/lib/format';

type Employee = {id:string;name:string;active:boolean;activity:Record<string,number>;score:EmployeeScoreResult|null;
  reviewed:number;eligible:number;delays:number;holds:number};
const titles:Record<string,string>={assessment_created:'کارشناسی ثبت‌شده',assessment_finalized:'کارشناسی نهایی',
  package_submitted:'ارسال کل کارشناسی',part_reviewed:'تصمیم بررسی فنی',work_started:'شروع کار',work_completed:'پایان کار',work_approved:'تأیید تحویل'};
export function EmployeePerformance() {
  const {data,error}=useSWR<{from:string;to:string;employees:Employee[]}>('/reports/employees',fetcher);
  if(error) return <p role="alert">گزارش عملکرد کارکنان دریافت نشد.</p>;
  if(!data) return <p role="status">در حال دریافت عملکرد کارکنان…</p>;
  return <section className="panel panel-body stack"><h2>عملکرد کارکنان در ماه جاری</h2>
    <p>{formatJalali(data.from)} تا {formatJalali(data.to)}</p>
    {data.employees.map(person=><details key={person.id}><summary>{person.name} · {person.score?.score!=null ? faNum(person.score.score)+' از ۱۰۰' : 'شواهد کافی برای امتیاز وجود ندارد'}{!person.active && ' · غیرفعال'}</summary>
      <p>شناسه کارمند <bdi>{person.id}</bdi></p>
      <p>{Object.entries(person.activity).map(([key,n])=>(titles[key]??key)+' '+faNum(n)).join('، ') || 'فعالیت قابل انتساب در این بازه ثبت نشده است.'}</p>
      {person.score && <><p>کارهای واجد بررسی با موعد این ماه {faNum(person.eligible)} · تحویل با تأیید مستقل {faNum(person.reviewed)} · عبور از موعد {faNum(person.delays)} · دارای توقف ثبت‌شده {faNum(person.holds)}</p>
      <dl>{([['progress','تحویل تأییدشده از کارهای واجد بررسی (۳۰)'],['timeliness','تحویل در موعد برنامه اولیه (۲۵)'],['accuracy','تحویل بدون بازگشایی ثبت‌شده (۲۵)'],['accountability','ثبت پایان به دست خود تکنسین (۲۰)']] as const).map(([k,title])=><div key={k}><dt>{title}</dt><dd>{person.score?.breakdown[k]!=null ? faNum(person.score.breakdown[k]!) : 'داده کافی نیست'}</dd></div>)}</dl>
      {person.holds>0 && <p>علت توقف کارهای این کارمند را در پرونده‌ها مرور کنید.</p>}
      {person.delays>0 && <p>برنامه کارهای گذشته از موعد را با زمان تحویل تطبیق دهید.</p>}</>}
    </details>)}</section>;
}
